import concurrent.futures
import http.client
import json
import socket
import subprocess
import sys
import time

p = subprocess.Popen([sys.argv[1]], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
try:
    port1, token1, port2, token2 = p.stdout.readline().split()
    port1, port2 = int(port1), int(port2)
    def request(port, token=None, path='/api/state', body=None, headers=None):
        c = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        h = {'X-Souz-Token': token} if token else {}
        if body is not None: h['Content-Type'] = 'text/plain'
        if headers: h.update(headers)
        c.request('GET' if body is None else 'POST', path, body, h)
        r = c.getresponse(); result = r.status, r.read(); c.close(); return result
    def state(port=port1, token=token1):
        status, body = request(port, token); assert status == 200
        return json.loads(body)['speed']
    def command(s):
        p.stdin.write(s+'\n'); p.stdin.flush(); return p.stdout.readline().strip()
    assert abs(state()-.35)<1e-5
    assert request(port1, path='/')[0] == 200
    assert b'Souz' in request(port1, path='/')[1]
    assert request(port1)[0] == 403
    assert request(port1, token2)[0] == 403
    assert request(port1, token1, '/api/speed', '0.75')[0] == 200
    assert state() == .75 and abs(state(port2,token2)-.35)<1e-5
    assert command('host 0.2') == 'ok' and abs(state()-.2)<1e-5
    for bad in ['nan', 'inf', '-1', '1.1', '0.5junk', '1'*65, '']:
        assert request(port1, token1, '/api/speed', bad)[0] == 400, bad
    assert request(port1, token1, '/api/speed', '.5', {'Origin':'http://evil.example'})[0] == 403
    assert request(port1, token1, '/api/speed', '.5', {'Origin':f'http://127.0.0.1:{port1}'})[0] == 200
    assert request(port1, token1, '/api/speed', '.5', {'Content-Type':'application/json'})[0] == 400
    info = json.loads(request(port1,token1,'/api/info')[1]); assert info['port']==port1 and info['urls']
    # Incomplete clients cannot block other clients or shutdown.
    slow = socket.create_connection(('127.0.0.1',port1)); slow.sendall(b'GET / HTTP/1.1\r\n')
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        assert all(pool.map(lambda _: state() == .5, range(40)))
    # Fragmented request body is assembled before committing the value.
    s=socket.create_connection(('127.0.0.1',port1));s.settimeout(3)
    s.sendall(f'POST /api/speed HTTP/1.1\r\nHost: 127.0.0.1:{port1}\r\nX-Souz-Token: {token1}\r\nContent-Type: text/plain\r\nContent-Length: 3\r\n\r\n0'.encode())
    time.sleep(.03); assert state() == .5
    s.sendall(b'.8'); assert b'200 OK' in s.recv(4096);s.close();assert abs(state()-.8)<1e-5
    # Oversized body announced in headers, body sent late: the 400 must survive the close
    # (Windows resets the connection if unread bytes remain when the server closes).
    for _ in range(20):
        s=socket.create_connection(('127.0.0.1',port1));s.settimeout(3)
        s.sendall(f'POST /api/speed HTTP/1.1\r\nHost: 127.0.0.1:{port1}\r\nX-Souz-Token: {token1}\r\nContent-Type: text/plain\r\nContent-Length: 65\r\n\r\n'.encode())
        time.sleep(.05); s.sendall(b'1'*65)
        data=b''
        while True:
            chunk=s.recv(4096)
            if not chunk: break
            data+=chunk
        assert b'400 Bad Request' in data; s.close()
    # Idle socket gets evicted after its absolute deadline.
    time.sleep(2.1);slow.settimeout(1);assert slow.recv(1)==b'';slow.close()
    hanging=socket.create_connection(('127.0.0.1',port1));hanging.sendall(b'GET /')
    start=time.monotonic();assert command('stop1')=='stopped';assert time.monotonic()-start<1
    hanging.close()
    assert abs(state(port2,token2)-.35)<1e-5
    try:
        socket.create_connection(('127.0.0.1',port1),timeout=.2)
        raise AssertionError('removed instance still listening')
    except OSError: pass
    p.stdin.write('quit\n');p.stdin.flush();assert p.wait(timeout=3)==0
    print('PASS: HTTP, embedded UI, auth, validation, host updates, two instances, concurrent clients, fragmented requests, deadlines, shutdown and restart')
finally:
    if p.poll() is None: p.kill();p.wait()
