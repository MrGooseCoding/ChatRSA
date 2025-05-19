const {Server} = require('socket.io');
const express = require('express');
const { createServer } = require('http');
const url = require('url');
const crypto = require('crypto');

const app = express();

app.use(express.json())

const http = createServer(app);
const io = new Server(http);
const port = 4000;

function generate_code() {
    return Math.floor(100000 + Math.random() * 900000)
}

var roomIDs = [
]

var symmetricKeys = {
}

var ivs = {
}

var usernames = {
}

app.get("/", function(req, res) {
    res.sendFile(__dirname + "/index.html");
});

app.get("/static/style", function(req, res) {
    res.sendFile(__dirname + "/style.css");
});

app.post("/api/createChat", function(req, res) {

    const code = `${generate_code()}`
    const symmetricKey = crypto.randomBytes(32).toString('hex');
    const iv = crypto.randomBytes(16).toString('hex');

    roomIDs.push(`${code}`)

    console.log("[ API ] Created chat: ", code, "Symmetric key: ", symmetricKey, "IV: ", iv)
    console.log("[ API ] Emmiting room ID ", code)

    symmetricKeys[code] = `${symmetricKey}`
    ivs[code] = `${iv}`
    usernames[code] = []

    res.send({roomID: code})
})

io.on("connection", async function(socket) {
    const { query } = url.parse(socket.handshake.url, true);
    this.roomID = query.roomID;
    this.username = query.username.trim();
    
    if (roomIDs.includes(this.roomID)) {
        const iv = ivs[this.roomID]

        console.log("[ WS ] Accepted connection from username: ", this.username)

        socket.emit('iv', {
            iv: iv
        })

        console.log("[ WS ] Emmiging iv: ", iv)
    } else {
        console.log("Hey")
        socket.emit('invalid_roomid', 'Invalid Room ID.')
        console.log("Hey")
        socket.disconnect()
    }

    if (!this.username) {
        socket.emit('invalid_username', {error:'Invalid username'})
        socket.disconnect()
    }

    console.log(usernames, this.roomID)


    if (usernames[this.roomID].includes(this.username)) {
        socket.emit('invalid_username', {error:'Username is already in the chat. Please choose another one'})
        socket.disconnect()
    }

    socket.on("public_key", async (data) => {
        const symmetricKey = symmetricKeys[this.roomID]
        const encodedSymmetricKey = new TextEncoder().encode(symmetricKey)
        const publicKey = data.publicKey

        console.log("[ WS , public_key ] Recieved public key: ", publicKey, " from user: ", this.username)

        const importedPublicKey = await crypto.subtle.importKey(
            "jwk",
            publicKey,
            {
                name: "RSA-OAEP",
                hash: { 
                    name: "SHA-256" 
                },
            },
            true,
            ["encrypt"]
        );

        console.log("[ WS ] Encrypting symmetric key: ", symmetricKey, " with public key: ", publicKey, " of user: ", this.username)
        
        // Encrypt the message using the imported public key
        const encryptedData = await crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            importedPublicKey,
            encodedSymmetricKey
        );

        console.log("[ WS ] Emmiting encrypted symmetric key: ", encryptedData, " to user: ", this.username)

        // Convert the encrypted message to a base64 string for transmission/storage
        //const encryptedDataBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(encryptedData)));

        socket.emit("symmetric_key", {symmetricKey: encryptedData})      

    })

    socket.on("user_join", (data) => {
        console.log("[ WS ] User joined: ", this.username)
        usernames[this.roomID].push(this.username)

        socket.join(this.roomID)
        socket.to(this.roomID).emit("user_join", this.username);
    });

    socket.on("chat_message", (data) => {
        console.log("[ WS ] Recieved encrypted message: ", data, 'from user: ', this.username)
        console.log("[ WS ] Emmiting encrypted message: ", { message: data, username: this.username })
        socket.to(this.roomID).emit("chat_message", { message: data, username: this.username});
    });

    socket.on("disconnect", (data) => {
        console.log("[ WS ] Disconnected user: ", this.username )

        usernames[this.roomID].splice(usernames[this.roomID].indexOf(this.username), 1)
        console.log(usernames)

        socket.to(this.roomID).emit("user_leave", this.username);
    });

    // Secret event

});

http.listen(port, function() {
    console.log("Listening on *:" + port);
});
