const { createServer } = require("http");
const next = require("next");
const WebSocket = require("ws");
const pty = require("node-pty");
const os = require("os");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer((req, res) => {
        handle(req, res);
    });

    const wss = new WebSocket.Server({ noServer: true });

    wss.on("connection", (ws) => {
        console.log("Client connected");

        // Spawn Claude CLI directly in a pseudo-terminal
        const term = pty.spawn("claude", [], {
            name: "xterm-color",
            cols: 120,
            rows: 40,
            cwd: process.cwd(),
            env: process.env,
        });

        let buffer = "";
        let lastSendTime = Date.now();
        let sendTimeout = null;

        // Send terminal output to WebSocket with buffering
        term.onData((data) => {
            buffer += data;

            // Clear existing timeout
            if (sendTimeout) {
                clearTimeout(sendTimeout);
            }

            // Send data after a short delay or if enough time has passed
            const timeSinceLastSend = Date.now() - lastSendTime;
            const delay = timeSinceLastSend > 1000 ? 100 : 500;

            sendTimeout = setTimeout(() => {
                if (buffer.trim()) {
                    ws.send(buffer);
                    buffer = "";
                    lastSendTime = Date.now();
                }
            }, delay);
        });

        // Send WebSocket input to terminal
        ws.on("message", (msg) => {
            const message = msg.toString();
            term.write(message);

            // If message doesn't end with newline, add one
            if (!message.endsWith("\n") && !message.endsWith("\r")) {
                term.write("\r");
            }
        });

        // Clean up on disconnect
        ws.on("close", () => {
            console.log("Client disconnected");
            if (sendTimeout) {
                clearTimeout(sendTimeout);
            }
            term.kill();
        });
    });

    server.on("upgrade", (req, socket, head) => {
        if (req.url === "/api/terminal") {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit("connection", ws, req);
            });
        }
    });

    server.listen(3000, () =>
        console.log("Server running on http://localhost:3000")
    );
});
