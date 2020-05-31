import http.server
import socketserver
import socket

HOST = 'localhost'


PORT = 8081

connections = dict()
sockets = dict()


class NMEAHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        s.send_response(200)
        s.send_header("Content-type", "text/html")
        s.end_headers()
        s.wfile.write("Hello".encode())

    def do_POST(s):
        content_len = int(s.headers.get('Content-Length'))
        post_body = s.rfile.read(content_len)
        race_id = s.path[6:9]
        forward_message(int(race_id), post_body)
        s.send_response(204)
        s.send_header('Access-Control-Allow-Origin', '*')
        s.end_headers()


def forward_message(conn_id, message):
    conn = create_connection(conn_id)
    if conn:
        try:
            conn.send(message + '\n'.encode('ascii'))
        except Exception:
            print('Client ' + str(conn_id) + ' went away, closing connection')
            conn.close()
            connections.pop(conn_id, None)
    else:
        print('No one listening for ' + str(conn_id))


def create_connection(conn_id):
    if conn_id in connections:
        return connections[conn_id]
    else:
        print('Creating connection for ' + str(conn_id))
        conn = None
        if conn_id not in sockets:
            sockets[conn_id] = create_socket(conn_id)
        conn = accept_connection(sockets[conn_id])
        if conn:
            connections[conn_id] = conn
        return conn


def create_socket(conn_id):
    print('Creating socket for ' + str(conn_id))
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setblocking(False)
    sock.bind((HOST, 10000 + conn_id))
    sock.listen(0)
    return sock


def accept_connection(sock):
    print('Accepting on ' + str(sock))
    try:
        (conn, address) = sock.accept()
        return conn
    except IOError as io_error:
        print('Accept on ' + str(sock) + 'failed: ' + str(io_error))
        return None


server = socketserver.TCPServer(("", PORT), NMEAHandler)
print("Listening on port", PORT)
server.serve_forever()
