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
    def values(port=port1, token=token1):
        status, body = request(port, token); assert status == 200
        return json.loads(body)['v']
    def state(i, port=port1, token=token1): return values(port, token)[i]
    def put(body, port=port1, token=token1, **kw): return request(port, token, '/api/set', body, **kw)
    def command(s):
        p.stdin.write(s+'\n'); p.stdin.flush(); return p.stdout.readline().strip()
    SPEED, ENGINE, SHAPE, REVERSE, PAL = 7, 0, 1, 16, 2

    # --- page, auth, schema -------------------------------------------------
    assert len(values()) == 34 and abs(state(SPEED)-.35)<1e-5 and state(PAL) == 1
    assert request(port1, path='/')[0] == 200
    assert b'Souz' in request(port1, path='/')[1] and b'id="blocks"' in request(port1, path='/')[1]
    assert request(port1)[0] == 403 and request(port1, token2)[0] == 403
    assert request(port1, path='/api/schema')[0] == 403
    status, body = request(port1, token1, '/api/schema'); assert status == 200
    schema = json.loads(body); assert schema['count'] == 34 and [g['id'] for g in schema['groups']] == ['gen','color']
    names = lambda g: [i['label'] for i in g['items']]
    assert names(schema['groups'][0]) == ['Engine','Shape','Palette','Scale','Density','Smoothness','Blur','Speed','Warp','Seed','Rotation','Reverse']
    assert names(schema['groups'][1]) == ['Brightness','Contrast','Saturation','ColorShift','Pulse','Cor 1','Cor 2','Cor 3','Cor 4','Invert']
    items = {i['label']: i for g in schema['groups'] for i in g['items']}
    assert items['Speed']['i'] == SPEED and items['Reverse']['i'] == REVERSE and items['Invert']['i'] == 17
    assert (items['Cor 1']['h'], items['Cor 1']['s'], items['Cor 1']['b']) == (18,19,20) and items['Cor 4']['h'] == 30
    assert len(items['Engine']['options']) == 14 and len(items['Palette']['options']) == 32 and items['Palette']['options'][5]['c']
    # every slot the schema exposes must be a distinct, valid index
    used = [i['i'] for i in items.values() if 'i' in i] + [i[k] for i in items.values() if 'h' in i for k in 'hsb']
    assert len(used) == len(set(used)) == 30 and max(used) < 34

    # --- writes: single, batch, atomic rejection, per-kind validation --------
    assert put('7 0.75')[0] == 200 and state(SPEED) == .75
    assert command('peek 7') == '0.75 1'
    assert abs(state(SPEED, port2, token2)-.35)<1e-5
    assert command('host 7 0.2') == 'ok' and abs(state(SPEED)-.2)<1e-5 and command('peek 7') == '0.2 0'
    assert put('0 5\n1 9\n2 12\n3 0.1\n16 1\n17 1\n18 0.5\n7 0.6\n')[0] == 200
    v = values(); assert (v[0],v[1],v[2],v[16],v[17]) == (5,9,12,1,1) and abs(v[18]-.5)<1e-5 and abs(v[7]-.6)<1e-5
    before = values()
    for bad in ['7 nan','7 inf','7 -1','7 1.1','7 0.5junk','7 '+'1'*65,'','\n','7','7 ','x 1','07x 1','99 0.5','34 0.5','-1 0.5',' 7 0.5','7  0.5','7 0.5 1',
                '0 14','0 -1','0 1.5','1 14','2 32','16 2','16 0.5','17 -1',
                '7 0.1\n99 1','7 0.1\n0 14',
                '\n'.join('7 0.1' for _ in range(9))]:
        assert put(bad)[0] == 400, repr(bad)
    assert values() == before, 'a rejected request must not change anything'
    assert put('\n'.join('%d 0.5' % i for i in range(3,11)))[0] == 200  # exactly 8 pairs
    assert put('7 0.5', headers={'Origin':'http://evil.example'})[0] == 403
    assert put('7 0.5', headers={'Origin':f'http://127.0.0.1:{port1}'})[0] == 200
    assert put('7 0.5', headers={'Content-Type':'application/json'})[0] == 400
    assert request(port1, token1, '/api/speed', '0.5')[0] == 404
    assert put('7 0.5', token='')[0] == 403
    info = json.loads(request(port1,token1,'/api/info')[1]); assert info['port']==port1 and info['urls']
    # instances are independent for every slot
    assert put('0 3\n18 0.1', port2, token2)[0] == 200 and state(0) == 5 and state(0, port2, token2) == 3
    assert put('0 0\n18 0.62', port2, token2)[0] == 200

    # --- robustness ----------------------------------------------------------
    slow = socket.create_connection(('127.0.0.1',port1)); slow.sendall(b'GET / HTTP/1.1\r\n')
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        assert all(pool.map(lambda _: state(SPEED) == .5, range(40)))
    s=socket.create_connection(('127.0.0.1',port1));s.settimeout(3)
    s.sendall(f'POST /api/set HTTP/1.1\r\nHost: 127.0.0.1:{port1}\r\nX-Souz-Token: {token1}\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\n7 0.'.encode())
    time.sleep(.03); assert state(SPEED) == .5
    s.sendall(b'8'); assert b'200 OK' in s.recv(4096);s.close();assert abs(state(SPEED)-.8)<1e-5
    # Oversized body announced in headers, body sent late: the 400 must survive the close
    # (Windows resets the connection if unread bytes remain when the server closes).
    for _ in range(20):
        s=socket.create_connection(('127.0.0.1',port1));s.settimeout(3)
        s.sendall(f'POST /api/set HTTP/1.1\r\nHost: 127.0.0.1:{port1}\r\nX-Souz-Token: {token1}\r\nContent-Type: text/plain\r\nContent-Length: 300\r\n\r\n'.encode())
        time.sleep(.05); s.sendall(b'1'*300)
        data=b''
        while True:
            chunk=s.recv(4096)
            if not chunk: break
            data+=chunk
        assert b'400 Bad Request' in data; s.close()
    time.sleep(2.1);slow.settimeout(1);assert slow.recv(1)==b'';slow.close()
    hanging=socket.create_connection(('127.0.0.1',port1));hanging.sendall(b'GET /')
    start=time.monotonic();assert command('stop1')=='stopped';assert time.monotonic()-start<1
    hanging.close()
    assert abs(state(SPEED, port2,token2)-.35)<1e-5
    try:
        socket.create_connection(('127.0.0.1',port1),timeout=.2)
        raise AssertionError('removed instance still listening')
    except OSError: pass
    p.stdin.write('quit\n');p.stdin.flush();assert p.wait(timeout=3)==0
    print('PASS: HTTP, embedded UI, auth, schema, 34 parameters, batch/atomic writes, per-kind validation, host sync, two instances, concurrent clients, fragmented requests, deadlines, shutdown and restart')
finally:
    if p.poll() is None: p.kill();p.wait()
