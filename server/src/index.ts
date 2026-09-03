import http from "http";
import express from "express";
import cors from "cors";
import { Server, matchMaker } from "colyseus";
import { GameRoom } from "./rooms/GameRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

app.get("/rooms", async (req, res) => {
    try {
        const rooms = await matchMaker.query({});
        res.json(rooms);
    } catch (e) {
        console.error(e);
        res.status(500).json([]);
    }
});

const server = http.createServer(app);
const gameServer = new Server({
    server,
} as any);

gameServer.define('game_room', GameRoom).filterBy(['roomName']);

gameServer.listen(port).then(() => {
    console.log(`[GameServer] Listening on Port: ${port}`);
});
