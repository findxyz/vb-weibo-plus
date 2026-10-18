import hashlib
import json
import pathlib
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile


workspace = pathlib.Path(__file__).resolve().parents[4]
evidence = pathlib.Path(tempfile.mkdtemp(prefix='react-chat-35-jar-'))
jar = workspace / 'target/weibo-plus.jar'
with zipfile.ZipFile(jar) as archive:
    names = set(archive.namelist())
    for name in ['chat/index.html', 'post/index.html', 'favicon.svg', 'favicon.ico',
                 'chat/dream/1176117365.html']:
        assert 'BOOT-INF/classes/static/' + name in names, name
    retired = ['preview/chat/index.html', 'preview/post/index.html', 'chat/chat.js', 'chat/chat.css',
               'chat/marked.min.js', 'chat/weibo-emoji.js', 'shared/date.js', 'shared/linkify.js']
    for name in retired:
        assert 'BOOT-INF/classes/static/' + name not in names, name
    assert not any(name.startswith('BOOT-INF/classes/static/shared/') for name in names)

database = evidence / 'fixture.db'
connection = sqlite3.connect(database)
connection.executescript((workspace / 'src/main/resources/schema.sql').read_text(encoding='utf-8'))
for gid, name in [(1, '打包验收群'), (2, '第二验收群')]:
    connection.execute('INSERT INTO groups (gid,name,avatar,member_count,max_member,admins) VALUES (?,?,?,?,?,?)',
                       (gid, name, 'https://avatar.example.test/group.svg', 12, 50, '[1176117365]'))
for mid in range(1, 81):
    epoch = 1785888000000 + mid * 60000
    connection.execute('INSERT INTO messages (mid,gid,msg_type,msg_type_name,media_type,sender_id,'
                       'sender_name,sender_avatar,text,fid,created_at,saved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                       (mid, 1, 1, '文本', 1 if mid == 80 else 0, 1176117365, '验收成员',
                        'https://avatar.example.test/member.svg',
                        '验收图片' if mid == 80 else f'打包消息 {mid} https://example.com/read',
                        'fixture-image' if mid == 80 else '', epoch, epoch))
connection.execute('INSERT INTO analyses (gid,date,prompt,result,message_count,created_at) VALUES (?,?,?,?,?,?)',
                   (1, 1785859200000, '验收提示词', '## 打包分析\n\n- 本地历史正常\n\n<script>window.attack=1</script>', 80, 1785892800000))
connection.execute('INSERT INTO bloggers (uid,screen_name) VALUES (?,?)', (1, '验收博主'))
connection.execute('INSERT INTO posts (mblogid,post_id,uid,content,created_at,saved_at) VALUES (?,?,?,?,?,?)',
                   ('jar-chat-34', 1, 1, '打包微博正文', 1785888000000, 1785888000000))
connection.commit()
initial_snapshot = '\n'.join(connection.iterdump())
connection.close()
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
base = f'http://127.0.0.1:{port}'
settings = subprocess.run(['java', '-XshowSettings:properties', '-version'], capture_output=True, text=True, check=True)
java_home = next(line.split('=', 1)[1].strip() for line in settings.stderr.splitlines() if 'java.home =' in line)
java = pathlib.Path(java_home) / 'bin' / ('java.exe' if sys.platform == 'win32' else 'java')
arguments = [str(java), '-jar', str(jar), '--server.address=127.0.0.1', f'--server.port={port}',
             f'--spring.datasource.url=jdbc:sqlite:{database.as_posix()}?busy_timeout=5000&journal_mode=WAL',
             f'--weibo.database-path={database.as_posix()}',
             f'--weibo.cookie-file={(evidence / "missing-credential.txt").as_posix()}',
             '--weibo.chat.auto-sync-gids=']
print(f'Evidence: {evidence}', flush=True)
with (evidence / 'application.log').open('w', encoding='utf-8') as logfile:
    process = subprocess.Popen(arguments, cwd=evidence, stdout=logfile, stderr=subprocess.STDOUT,
                               creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0)
    try:
        for attempt in range(120):
            try:
                with urllib.request.urlopen(base + '/chat/groups', timeout=1) as response:
                    assert len(json.load(response)) == 2
                break
            except Exception:
                if process.poll() is not None:
                    raise RuntimeError('JAR exited during startup')
                time.sleep(0.5)
        else:
            raise TimeoutError('JAR did not start')
        subprocess.run(['node', str(pathlib.Path(__file__).with_suffix('.mjs')),
                        str(workspace / 'frontend'), base, str(evidence)], check=True)
        with sqlite3.connect(database) as connection:
            assert connection.execute('SELECT COUNT(*) FROM messages').fetchone()[0] == 80
            assert connection.execute('SELECT COUNT(*) FROM analyses').fetchone()[0] == 1
            assert '\n'.join(connection.iterdump()) == initial_snapshot
        with jar.open('rb') as artifact:
            digest = hashlib.file_digest(artifact, 'sha256').hexdigest()
        (evidence / 'artifact.json').write_text(json.dumps({
            'sha256': digest,
            'jar': str(jar), 'database_unchanged': True,
        }, indent=2), encoding='utf-8')
        print('Final JAR, local query paths, three-size formal page checks and database isolation: PASS', flush=True)
    finally:
        process.terminate()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
