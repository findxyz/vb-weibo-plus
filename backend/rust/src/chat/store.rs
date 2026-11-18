use rusqlite::{Connection, OptionalExtension, Row, params, types::Type};
use serde_json::{Value, json};

use super::{CursorQuery, MessageQuery, empty_group};

const MESSAGE_COLUMNS: &str = "mid, gid, msg_type, msg_type_name, media_type, sender_id, sender_name, sender_avatar, text, fid, video_cover_fid, url_objects, pic_infos, template, template_data, recall_mids, recall_by, created_at, saved_at";
const GROUP_COLUMNS: &str = "g.gid, g.name, g.avatar, g.member_count, g.max_member, g.owner_id, g.admins, g.summary, g.group_type";

pub(super) fn list_groups(connection: &mut Connection) -> rusqlite::Result<Vec<Value>> {
    let sql = format!(
        "SELECT {GROUP_COLUMNS}, m.mid, m.sender_name, m.text, m.msg_type_name,
          (SELECT COUNT(*) FROM messages WHERE gid = g.gid)
          FROM groups g LEFT JOIN messages m ON m.mid = g.max_mid
          ORDER BY g.updated_at DESC, g.gid DESC"
    );
    let mut statement = connection.prepare(&sql)?;
    statement
        .query_map([], |row| {
            let mut group = group_record(row)?;
            let latest_mid = row.get::<_, Option<i64>>(9)?;
            let latest_text = row_string(row, 11)?;
            let latest_text = if latest_mid.is_some() && latest_text.trim().is_empty() {
                format!("[{}]", row_string(row, 12)?)
            } else {
                latest_text
            };
            group["latestSenderName"] = json!(row_string(row, 10)?);
            group["latestMessage"] = json!(latest_text);
            group["messageCount"] = json!(row.get::<_, i64>(13)?);
            Ok(group)
        })?
        .collect()
}

pub(super) fn group_records(connection: &mut Connection) -> rusqlite::Result<Vec<Value>> {
    let sql =
        format!("SELECT {GROUP_COLUMNS} FROM groups g ORDER BY g.updated_at DESC, g.gid DESC");
    let mut statement = connection.prepare(&sql)?;
    statement.query_map([], group_record)?.collect()
}

fn group(connection: &Connection, gid: i64) -> rusqlite::Result<Value> {
    let sql = format!("SELECT {GROUP_COLUMNS} FROM groups g WHERE gid = ?1");
    Ok(connection
        .query_row(&sql, [gid], group_record)
        .optional()?
        .unwrap_or_else(|| empty_group(gid)))
}

fn group_record(row: &Row<'_>) -> rusqlite::Result<Value> {
    Ok(json!({
        "gid": row.get::<_, i64>(0)?, "name": row.get::<_, String>(1)?,
        "avatar": row.get::<_, Option<String>>(2)?, "memberCount": row_number(row, 3)?,
        "maxMember": row_number(row, 4)?, "ownerId": row_number(row, 5)?,
        "admins": json_column(row, 6, json!([]))?, "summary": row.get::<_, Option<String>>(7)?,
        "groupType": row_number(row, 8)?,
    }))
}

pub(super) fn query_messages(
    connection: &Connection,
    query: MessageQuery,
    start: Option<i64>,
    end: Option<i64>,
) -> rusqlite::Result<Value> {
    let sender = query.sender_name.filter(|name| !name.trim().is_empty());
    let keyword = query
        .keyword
        .filter(|text| !text.trim().is_empty())
        .map(|text| {
            format!(
                "%{}%",
                text.replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_")
            )
        });
    let filter = "gid = ?1 AND (?2 IS NULL OR created_at >= ?2) AND (?3 IS NULL OR created_at <= ?3) AND (?4 IS NULL OR sender_name = ?4) AND (?5 IS NULL OR text LIKE ?5 ESCAPE '\\')";
    let total: i64 = connection.query_row(
        &format!("SELECT COUNT(*) FROM messages WHERE {filter}"),
        params![query.gid, start, end, sender, keyword],
        |row| row.get(0),
    )?;
    let mut statement = connection.prepare(&format!(
        "SELECT {MESSAGE_COLUMNS} FROM messages WHERE {filter} ORDER BY created_at DESC, mid DESC LIMIT ?6 OFFSET ?7"
    ))?;
    let offset = (query.page - 1).saturating_mul(query.size);
    let items = statement
        .query_map(
            params![query.gid, start, end, sender, keyword, query.size, offset],
            message_view,
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(
        json!({"group": group(connection, query.gid)?, "items": items, "page": query.page, "size": query.size, "total": total}),
    )
}

pub(super) fn query_cursor(connection: &Connection, query: CursorQuery) -> rusqlite::Result<Value> {
    let after = query.after_created_at.zip(query.after_mid);
    let before = query.before_created_at.zip(query.before_mid);
    let base = format!("SELECT {MESSAGE_COLUMNS} FROM messages WHERE gid = ?1");
    let items = if let Some((time, mid)) = after.or(before) {
        let (comparison, order) = if after.is_some() {
            (">", "ASC")
        } else {
            ("<", "DESC")
        };
        let mut statement = connection.prepare(&format!(
            "{base} AND (created_at, mid) {comparison} (?2, ?3) ORDER BY created_at {order}, mid {order} LIMIT ?4"
        ))?;
        statement
            .query_map(params![query.gid, time, mid, query.size + 1], message_view)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        let mut statement = connection.prepare(&format!(
            "{base} ORDER BY created_at DESC, mid DESC LIMIT ?2"
        ))?;
        statement
            .query_map(params![query.gid, query.size + 1], message_view)?
            .collect::<rusqlite::Result<Vec<_>>>()?
    };
    let mut items = items;
    let has_more = items.len() > query.size as usize;
    items.truncate(query.size as usize);
    let next = if has_more { items.last() } else { None };
    let next_time = next.and_then(|view| view["createdAt"].as_i64());
    let next_mid = next.and_then(|view| view["mid"].as_i64());
    let (next_before, next_after) = if after.is_some() {
        items.reverse();
        ((None, None), (next_time, next_mid))
    } else {
        ((next_time, next_mid), (None, None))
    };
    Ok(
        json!({"group": group(connection, query.gid)?, "items": items,
        "size": query.size, "hasMore": has_more,
        "nextBeforeCreatedAt": next_before.0, "nextBeforeMid": next_before.1,
        "nextAfterCreatedAt": next_after.0, "nextAfterMid": next_after.1}),
    )
}

fn message_view(row: &Row<'_>) -> rusqlite::Result<Value> {
    let mid = row.get::<_, i64>(0)?;
    let gid = row.get::<_, i64>(1)?;
    let media_type = row_number(row, 4)?;
    let text = row.get::<_, Option<String>>(8)?;
    let fid = row_string(row, 9)?;
    let video_cover = row_string(row, 10)?;
    let pics = json_column(row, 12, json!([]))?;
    let media = |kind| format!("/chat/media?gid={gid}&mid={mid}&variant={kind}");
    let mut preview = String::new();
    let mut original = String::new();
    let mut video = String::new();
    let mut file = String::new();
    if media_type == 1 && !fid.trim().is_empty() {
        preview = media("preview");
        original = media("original");
    } else if media_type == 10
        || (media_type == 13 && !text.as_deref().unwrap_or_default().contains("收到红包消息"))
    {
        if !video_cover.trim().is_empty() {
            preview = media("preview");
        }
        video = media("video");
    } else if media_type == 5 && !fid.trim().is_empty() {
        file = media("file");
    } else if media_type == 15 {
        preview = super::string(&pics[0]["original_pic"]);
        original.clone_from(&preview);
    }
    Ok(json!({
        "mid": mid, "gid": gid, "msgType": row_number(row, 2)?,
        "msgTypeName": row.get::<_, Option<String>>(3)?, "mediaType": media_type,
        "senderId": row_number(row, 5)?, "senderName": row.get::<_, Option<String>>(6)?,
        "senderAvatar": row.get::<_, Option<String>>(7)?, "text": text,
        "urlObjects": json_column(row, 11, json!([]))?, "picInfos": pics,
        "template": row.get::<_, Option<String>>(13)?, "templateData": json_column(row, 14, json!({}))?,
        "recallMids": json_column(row, 15, json!([]))?, "recallBy": row.get::<_, Option<String>>(16)?,
        "createdAt": row.get::<_, i64>(17)?, "savedAt": row.get::<_, i64>(18)?,
        "previewUrl": preview, "originalUrl": original, "videoUrl": video, "fileUrl": file,
    }))
}

pub(super) fn json_column(
    row: &Row<'_>,
    column: usize,
    fallback: Value,
) -> rusqlite::Result<Value> {
    let text = row_string(row, column)?;
    if text.trim().is_empty() {
        return Ok(fallback);
    }
    serde_json::from_str(&text).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column, Type::Text, Box::new(error))
    })
}

fn row_number(row: &Row<'_>, column: usize) -> rusqlite::Result<i64> {
    Ok(row.get::<_, Option<i64>>(column)?.unwrap_or_default())
}

fn row_string(row: &Row<'_>, column: usize) -> rusqlite::Result<String> {
    Ok(row.get::<_, Option<String>>(column)?.unwrap_or_default())
}
