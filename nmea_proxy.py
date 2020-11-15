import http.server
import socketserver
import socket
import logging


HOST = 'localhost'


PORT = 8081

connections = dict()
sockets = dict()


class NMEAHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(s):
        content_len = int(s.headers.get('Content-Length'))
        post_body = s.rfile.read(content_len)
        race_id = s.path[6:9]
        forward_message(int(race_id), post_body)
        s.send_response(204)
        s.send_header('Access-Control-Allow-Origin', '*')
        s.end_headers()

    def log_message(self, format, *args):
        pass


def forward_message(conn_id, message):
    conn = find_or_create_connection(conn_id)
    if conn:
        try:
            conn.send(message + '\r\n'.encode('ascii'))
        except Exception:
            print('Connection lost on port ' + str(conn_id) + ', closing.')
            conn.close()
            connections.pop(conn_id, None)


def find_or_create_connection(conn_id):
    if conn_id in connections:
        return connections[conn_id]
    else:
        conn = None
        if conn_id not in sockets:
            sockets[conn_id] = create_socket(conn_id)
        conn = accept_connection(sockets[conn_id])
        if conn:
            connections[conn_id] = conn
        return conn


def create_socket(conn_id):
    print('Creating socket for race ID ' + str(conn_id))
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setblocking(False)
    sock.bind((HOST, 10000 + conn_id))
    sock.listen(0)
    return sock


def accept_connection(sock):
    try:
        (conn, address) = sock.accept()
        print('Accepted connection on port ' + str(sock.getsockname()[1]))
        return conn
    except IOError:
        return None


print("Creating Server")
server = socketserver.TCPServer(("", PORT), NMEAHandler)
print("Listening on port", PORT)
try:
    server.serve_forever()
finally:
    print('Cleaning up')
    # This still doesn't free the socket
    server.server_close()
    print('Done')
