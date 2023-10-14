const db = await Deno.openKv();
const clients = new Map<string | null, WebSocket>();
const today = new Date();

interface client {
  uuid: string;
  messages: string[];
  status: boolean;
}

async function handler(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/" || "" && request.method === "get") {
    let file;
    try {
      file = await Deno.open("./index.html", { read: true });
    } catch {
      return new Response("NOT FOUND", { status: 404 });
    }
    const stream = file.readable;
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/html",
      },
    });
  }

  if (path === "/login" && request.method === "post") {
    return new Response(`${request.body}`);
  }

  if (path == "/ws") {
    const username = new URL(request.url).searchParams.get("username");
    if (request.headers.get("upgrade") != "websocket") {
      return new Response(null, { status: 501 });
    }

    const { socket, response } = Deno.upgradeWebSocket(request);
    if (clients.has(username)) {
      socket.close(1008, `${username} already taken`);
      return new Response(`${username} already taken`, {
        status: 404,
      });
    }

    clients.set(username, socket);
    const new_client = {
      uuid: crypto.randomUUID(),
      messages: [],
      status: true,
    };
    socket.addEventListener("open", () => {
      console.log(`${username} added to chatroom`);
      const usernames = [...clients.keys()];
      broadcast(JSON.stringify({
        event: "update-users",
        usernames: usernames,
        timestamp: today.toISOString(),
      }));
    });

    const result = await db.set(["users", username], {
      uuid: crypto.randomUUID(),
      messages: [],
      status: true,
    });
    console.log(result);
    socket.addEventListener("close", () => {
      console.log(`${username} exited from chatroom`);
      clients.delete(username);
    });
    socket.addEventListener("message", async (event) => {
      const data = JSON.parse(event.data);
      const entry = await db.get(["users", username]);
      let temp: any[] = entry.value.messages;
      temp.push(data.message);
      console.log(entry.value);
      console.log(temp);
      const result = await db.set(["users", username], {
        uuid: entry.value.uuid,
        messages: temp,
        status: true,
      });
      broadcast(JSON.stringify({
        event: "send-message",
        username: username,
        message: data.message,
        timestamp: today.toISOString(),
      }));
    });

    return response;
  }

  return new Response("NOT FOUND", { status: 404 });
}
Deno.serve(
  { port: 80, hostname: "0.0.0.0", handler },
);
//
// const chat = async (socket: WebSocket, res: Response) => {
//   const uuid = crypto.randomUUID();
//   clients.set(uuid, socket);
//   socket.addEventListener("open", () => {
//     console.log(uuid);
//   });
//   socket.addEventListener("message", (event) => {
//     if (typeof event.data == "string") {
//       socket.send(event.data);
//     }
//   });
//
//   return res;
// };
//

const broadcast = (message: string) => {
  clients.forEach((ws) => {
    ws.send(message);
  });
};
