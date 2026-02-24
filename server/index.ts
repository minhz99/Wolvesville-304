import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { SocketGateway } from './gateway/SocketGateway';

const app = express();
app.use(cors());

// Phục vụ các file tĩnh trong thư mục client
app.use(express.static(path.join(__dirname, '../client')));

const server = http.createServer(app);

// Khởi tạo Socket Gateway
const gateway = new SocketGateway(server);

const PORT = process.env.PORT || 3521;

server.listen(PORT, () => {
});
