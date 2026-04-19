const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const fs = require('fs'); // НОВЕ: Підключаємо вбудований модуль для роботи з файлами на диску

const io = new Server(server, {
    maxHttpBufferSize: 1e7 // Дозволяємо великі файли (картинки, аудіо)
});

// Роздаємо статичні файли (HTML, CSS, клієнтський JS)
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// --- НАША БАЗА ДАНИХ ---
const historyFile = './history.json'; // Назва файлу, де будуть жити повідомлення
let messageHistory = [];

// При запуску сервера перевіряємо, чи є вже збережена історія
if (fs.existsSync(historyFile)) {
    const rawData = fs.readFileSync(historyFile);
    messageHistory = JSON.parse(rawData);
    console.log(`📦 Завантажено ${messageHistory.length} повідомлень з бази даних.`);
}

// Створюємо "блокнот" для користувачів онлайн (socket.id -> ім'я)
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('Користувач підключився:', socket.id);

    // Відправляємо збережену історію повідомлень новому користувачу
    socket.emit('message history', messageHistory);

    socket.on('user joined', (name) => {
        socket.username = name;
        onlineUsers.set(socket.id, name);
        io.emit('system message', `${name} приєднався до чату 👋`);
        io.emit('update online users', Array.from(onlineUsers.values()));
    });

    socket.on('chat message', (data) => {
        // Додаємо нове повідомлення в пам'ять
        messageHistory.push(data);
        if (messageHistory.length > 50) {
            messageHistory.shift(); // Видаляємо найстаріше, якщо більше 50
        }
        
        // НОВЕ: Одразу зберігаємо оновлену історію у файл history.json
        // Параметри null, 2 роблять так, щоб файл був красиво відформатований, а не в один рядок
        fs.writeFileSync(historyFile, JSON.stringify(messageHistory, null, 2));
        
        // Розсилаємо повідомлення всім
        io.emit('chat message', data);
    });

    socket.on('typing', (name) => {
        socket.broadcast.emit('typing', name);
    });

    socket.on('stop typing', (name) => {
        socket.broadcast.emit('stop typing', name);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            io.emit('system message', `${socket.username} залишив чат 👋`);
            onlineUsers.delete(socket.id);
            io.emit('update online users', Array.from(onlineUsers.values()));
        }
    });
});

server.listen(3000, () => {
    console.log('🚀 Сервер запущено на http://localhost:3000');
});