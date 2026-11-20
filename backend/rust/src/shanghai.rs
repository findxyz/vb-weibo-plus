use std::sync::LazyLock;

use jiff::{
    Timestamp, ZonedDateTime,
    civil::{Date, DateTime},
    tz::{AmbiguousOffset, TimeZone},
};

static SHANGHAI: LazyLock<TimeZone> =
    LazyLock::new(|| TimeZone::get("Asia/Shanghai").expect("bundled Asia/Shanghai time zone"));

pub fn local_time(milliseconds: i64) -> Option<ZonedDateTime> {
    Timestamp::from_millisecond(milliseconds)
        .ok()
        .map(|timestamp| timestamp.to_zoned_datetime(SHANGHAI.clone()))
}

pub fn milliseconds(time: DateTime) -> Option<i64> {
    let timestamp = SHANGHAI.to_ambiguous_timestamp(time);
    if matches!(timestamp.offset(), AmbiguousOffset::Gap { .. }) {
        return None;
    }
    timestamp.earlier().ok().map(Timestamp::as_millisecond)
}

pub fn start_of_day(date: Date) -> Option<i64> {
    milliseconds(date.at(0, 0, 0, 0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_time_rejects_a_gap_and_chooses_the_earlier_instant_in_a_fold() {
        let gap = DateTime::constant(1991, 4, 14, 2, 30, 0, 0);
        let fold = DateTime::constant(1991, 9, 15, 1, 30, 0, 0);
        let earlier = Timestamp::strptime("%Y-%m-%d %H:%M %z", "1991-09-15 01:30 +0900").unwrap();

        assert_eq!(milliseconds(gap), None);
        assert_eq!(milliseconds(fold), Some(earlier.as_millisecond()));
    }
}
