// For Render.com deployment
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Basic health check endpoint
app.get('/', (req, res) => {
  res.send('🤖 SXIDHXSS MD Bot is running!');
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'whatsapp-bot' 
  });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`🌐 Web server running on port ${PORT}`);
});

// ===== ORIGINAL BOT CODE STARTS BELOW =====
// SXIDHXSS MD — Baileys WhatsApp bot

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");
const yts = require("yt-search");
const QRCode = require("qrcode");

// ---------- Config ----------
global.owner = [
  ["+255763789948", "Primary Owner", true],
  ["+2347016035139", "Secondary Owner", true],
];
global.sudo = ["255763789948", "2347016035139"];
const BOT_NAME = "SXIDHXSS MD";
const SESSION_FOLDER = "./session";
const PREFIX = ".";
// ----------------------------

// Create session folder if it doesn't exist
if (!fs.existsSync(SESSION_FOLDER)) {
  fs.mkdirSync(SESSION_FOLDER, { recursive: true });
  console.log(`Created session folder: ${SESSION_FOLDER}`);
}

// In-memory simple stores
const games = {
  ticTacToe: {},
  hangman: {},
  quizzes: {},
};

// Command cooldown prevention
const lastCommand = {};

// Helper functions
function isGroup(jid) {
  return jid && jid.endsWith("@g.us");
}
function jidToNumber(jid) {
  return jid ? jid.split("@")[0] : jid;
}
function quotedTextFromMsg(msg) {
  return msg?.message?.extendedTextMessage?.text || msg?.message?.conversation || "";
}

// Tic-tac-toe board
function tttBoardToText(board) {
  let out = "";
  for (let r = 0; r < 3; r++) {
    out += ` ${board[r * 3] || (r * 3 + 1)} | ${board[r * 3 + 1] || (r * 3 + 2)} | ${board[r * 3 + 2] || (r * 3 + 3)}\n`;
    if (r < 2) out += "---+---+---\n";
  }
  return out;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: true,
    browser: [BOT_NAME, "Chrome", "1.0.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P().child({ level: "silent" })),
    },
    version,
  });

  sock.ev.on("creds.update", saveCreds);

  // Reconnect handling
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log("Connection closed unexpectedly — reconnecting...");
        setTimeout(startBot, 3000);
      } else {
        console.log("Logged out. Delete session folder and restart to re-scan QR.");
      }
    }
    if (connection === "open") console.log(`${BOT_NAME} connected.`);
  });

  // Message handler
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const m = messages[0];
      if (!m || m.key?.fromMe) return;

      const chat = m.key.remoteJid;
      const sender = m.key.participant || m.key.remoteJid;
      const senderNum = jidToNumber(sender);
      const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      
      // Command cooldown
      const now = Date.now();
      if (lastCommand[chat] && (now - lastCommand[chat]) < 1000) return;
      lastCommand[chat] = now;

      // Presence updates
      setTimeout(() => sock.sendPresenceUpdate("composing", chat), 200);
      setTimeout(() => sock.sendPresenceUpdate("recording", chat), 1500);

      // Anti-delete
      if (m.message?.protocolMessage && m.message.protocolMessage.type === 0) {
        const deleted = m.message.protocolMessage.key;
        const user = deleted.participant || m.key.remoteJid;
        await sock.sendMessage(deleted.remoteJid, {
          text: `⚠️ Anti-Delete: A message was deleted by ${user}`,
        });
        return;
      }

      // Anti view-once
      if (m.message?.viewOnceMessageV2) {
        const recovered = m.message.viewOnceMessageV2.message;
        await sock.sendMessage(chat, { text: "🔓 Recovered a view-once message:" });
        await sock.sendMessage(chat, recovered, { quoted: m });
        return;
      }

      // Get message text
      const msgText =
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.imageMessage?.caption ||
        m.message?.videoMessage?.caption ||
        "";
      const body = (msgText || "").trim();
      const isCmd = body.startsWith(PREFIX);
      const command = isCmd ? body.slice(PREFIX.length).split(/\s+/)[0].toLowerCase() : "";
      const args = isCmd ? body.slice(PREFIX.length).split(/\s+/).slice(1) : [];
      const arg = args.join(" ");

      if (!isCmd) return;

      // ---------- GROUP COMMANDS ----------
      if (command === "tagall" || command === "everyone") {
        if (!isGroup(chat)) {
          return sock.sendMessage(chat, { text: "❌ Group only command." });
        }
        try {
          const metadata = await sock.groupMetadata(chat);
          const members = metadata.participants.map(u => u.id);
          let textTag = "📣 *Tagging everyone:*\n\n";
          members.forEach(u => textTag += `@${u.split("@")[0]}\n`);
          await sock.sendMessage(chat, { text: textTag, mentions: members });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Failed to tag everyone." });
        }
        return;
      }

      if (command === "promote") {
        if (!isGroup(chat)) return sock.sendMessage(chat, { text: "❌ Group only command." });
        if (mentions.length === 0) return sock.sendMessage(chat, { text: "Tag who you want to promote." });
        try {
          const metadata = await sock.groupMetadata(chat);
          const botParticipant = metadata.participants.find(p => p.id === sock.user.id);
          if (!botParticipant || !botParticipant.admin) return sock.sendMessage(chat, { text: "❌ Bot needs to be admin." });
          await sock.groupParticipantsUpdate(chat, mentions, "promote");
          await sock.sendMessage(chat, { text: "✅ User promoted." });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Failed to promote user." });
        }
        return;
      }

      if (command === "demote") {
        if (!isGroup(chat)) return sock.sendMessage(chat, { text: "❌ Group only command." });
        if (mentions.length === 0) return sock.sendMessage(chat, { text: "Tag who you want to demote." });
        try {
          const metadata = await sock.groupMetadata(chat);
          const botParticipant = metadata.participants.find(p => p.id === sock.user.id);
          if (!botParticipant || !botParticipant.admin) return sock.sendMessage(chat, { text: "❌ Bot needs to be admin." });
          await sock.groupParticipantsUpdate(chat, mentions, "demote");
          await sock.sendMessage(chat, { text: "⚠️ User demoted." });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Failed to demote user." });
        }
        return;
      }

      if (command === "kick") {
        if (!isGroup(chat)) return sock.sendMessage(chat, { text: "❌ Group only command." });
        if (mentions.length === 0) return sock.sendMessage(chat, { text: "Tag who you want to kick." });
        try {
          const metadata = await sock.groupMetadata(chat);
          const botParticipant = metadata.participants.find(p => p.id === sock.user.id);
          if (!botParticipant || !botParticipant.admin) return sock.sendMessage(chat, { text: "❌ Bot needs to be admin." });
          await sock.groupParticipantsUpdate(chat, mentions, "remove");
          await sock.sendMessage(chat, { text: "👢 User removed." });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Failed to remove user." });
        }
        return;
   }
                 // ---------- BASIC COMMANDS ----------
      if (command === "ping") {
        await sock.sendMessage(chat, { text: "Pong! 🔥" });
        return;
      }

      if (command === "menu" || command === "help") {
        const menu = `🔥 *${BOT_NAME} MENU* 🔥

👥 Group: .tagall .promote @user .demote @user .kick @user .leave
Basic: .ping .menu .owner .setnamebot <name> .setbio <text>
Fun: .quote .joke .truth .dare .dice .coin .guess
Games: .tictactoe @user (.tttmove) .hangmanstart (.hangmanguess) .quizstart (.quizanswer)
Media: .sticker .qr <text> .song <name> .yt <query> .math <equation>
Tools: .echo .say .reverse .countchars
Owner: .sudo <code> .broadcast <msg>`;
        await sock.sendMessage(chat, { text: menu });
        return;
      }

      if (command === "owner") {
        await sock.sendMessage(chat, { text: `👑 Owners:\n${global.owner.map((o) => o[0]).join("\n")}` });
        return;
      }

      if (command === "setnamebot") {
        if (!arg) return sock.sendMessage(chat, { text: "Usage: .setnamebot <name>" });
        try {
          await sock.updateProfileName(arg);
          await sock.sendMessage(chat, { text: `✅ Bot name set to: ${arg}` });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Failed to change name." });
        }
        return;
      }

      if (command === "setbio") {
        if (!arg) return sock.sendMessage(chat, { text: "Usage: .setbio <text>" });
        try {
          await sock.updateProfileStatus(arg);
          await sock.sendMessage(chat, { text: `✅ Bio updated.` });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Failed to update bio." });
        }
        return;
      }

      // ---------- STICKER ----------
      if (command === "sticker" || command === "s") {
        try {
          let mediaMsg = m;
          if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            mediaMsg = { 
              key: m.key, 
              message: m.message.extendedTextMessage.contextInfo.quotedMessage 
            };
          }
          const media = mediaMsg.message?.imageMessage || mediaMsg.message?.videoMessage;
          if (!media) {
            await sock.sendMessage(chat, { text: "Reply to an image/video or send one with caption .sticker" });
            return;
          }
          const stream = await sock.downloadMediaMessage(mediaMsg);
          await sock.sendMessage(chat, { sticker: stream });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Could not create sticker." });
        }
        return;
      }

      // ---------- MUSIC & YOUTUBE ----------
      if (command === "song" || command === "yt") {
        if (!arg) return await sock.sendMessage(chat, { text: "Usage: .song <song name>" });
        try {
          const r = await yts(arg);
          const item = r.videos[0];
          if (!item) return await sock.sendMessage(chat, { text: "❌ No results found." });
          await sock.sendMessage(chat, { text: `🎵 *${item.title}*\n${item.url}\nDuration: ${item.timestamp}` });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Error searching for song." });
        }
        return;
      }

      // ---------- MATH ----------
      if (command === "math") {
        if (!arg) return sock.sendMessage(chat, { text: "Example: .math 5+5*2" });
        try {
          let answer = eval(arg);
          await sock.sendMessage(chat, { text: `🧮 Answer: *${answer}*` });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Invalid equation." });
        }
        return;
      }

      // ---------- QR CODE ----------
      if (command === "qr") {
        if (!arg) return sock.sendMessage(chat, { text: "Example: .qr hello world" });
        try {
          const qrImg = await QRCode.toBuffer(arg);
          await sock.sendMessage(chat, { image: qrImg, caption: "Scan me" });
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Failed to generate QR code." });
        }
        return;
      }

      // ---------- OWNER / SUDO ----------
      if (command === "sudo") {
        const primaryOwner = global.owner[0][0].replace('+', '');
        if (senderNum !== primaryOwner) return await sock.sendMessage(chat, { text: "❌ You are not authorized (owner only)." });
        const code = arg;
        if (!code) return await sock.sendMessage(chat, { text: "Usage: .sudo <javascript code>" });
        try {
          let result = eval(code);
          await sock.sendMessage(chat, { text: `✅ Result:\n${String(result).slice(0, 4000)}` });
        } catch (e) {
          await sock.sendMessage(chat, { text: `❌ Error:\n${String(e)}` });
        }
        return;
      }

      if (command === "broadcast") {
        const primaryOwner = global.owner[0][0].replace('+', '');
        if (senderNum !== primaryOwner) return await sock.sendMessage(chat, { text: "❌ You are not authorized (owner only)." });
        const messageToSend = body.replace(".broadcast", "").trim();
        if (!messageToSend) return await sock.sendMessage(chat, { text: "Usage: .broadcast <message>" });
        const chats = Object.keys(sock.store.chats || {}).slice(0, 100);
        await sock.sendMessage(chat, { text: `📢 Sending to ${chats.length} chats...` });
        let success = 0;
        let failed = 0;
        for (const c of chats) {
          try {
            await sock.sendMessage(c, { text: `📢 Broadcast from owner:\n\n${messageToSend}` });
            success++;
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (e) {
            failed++;
          }
        }
        await sock.sendMessage(chat, { text: `✅ Broadcast completed.\nSuccess: ${success}\nFailed: ${failed}` });
        return;
      }

      // ---------- FUN COMMANDS ----------
      if (command === "quote") {
        await sock.sendMessage(chat, { text: "“Do one thing every day that scares you.” — Eleanor Roosevelt" });
        return;
      }
      
      if (command === "joke") {
        const jokeList = [
          "Why don't skeletons fight? They don't have the guts.",
          "I'm on a seafood diet. I see food and I eat it.",
          "Your phone is 100% faster when you're not using it.",
        ];
        const joke = jokeList[Math.floor(Math.random() * jokeList.length)];
        await sock.sendMessage(chat, { text: joke });
        return;
      }
      
      if (command === "guess") {
        const number = Math.floor(Math.random() * 10) + 1;
        await sock.sendMessage(chat, { text: `🎲 I choose: *${number}*` });
        return;
      }
      
      if (command === "truth") {
        await sock.sendMessage(chat, { text: "Truth: What's one secret you haven't told anyone?" });
        return;
      }
      
      if (command === "dare") {
        await sock.sendMessage(chat, { text: "Dare: Send a voice note singing the first line of your favourite song!" });
        return;
      }
      
      if (command === "dice") {
        const dice = Math.floor(Math.random() * 6) + 1;
        await sock.sendMessage(chat, { text: `🎲 You rolled: ${dice}` });
        return;
      }
      
      if (command === "coin") {
        const c = Math.random() < 0.5 ? "Heads" : "Tails";
        await sock.sendMessage(chat, { text: `🪙 ${c}` });
        return;
      }

      // ---------- SAY COMMAND ----------
      if (command === "say") {
        if (!arg) return sock.sendMessage(chat, { text: "Write something to repeat." });
        await sock.sendMessage(chat, { text: arg });
        return;
      }

      // ---------- TIC-TAC-TOE ----------
      if (command === "tictactoe" || command === "ttt") {
        const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentioned.length === 0) {
          await sock.sendMessage(chat, { text: "Usage: .ttt @user — mention the user you challenge" });
          return;
        }
        const opponent = mentioned[0];
        const initiator = m.key.participant || m.key.remoteJid;
        if (opponent === initiator) return await sock.sendMessage(chat, { text: "You cannot challenge yourself." });
        games.ticTacToe[chat] = {
          board: Array(9).fill(""),
          players: [initiator, opponent],
          turn: initiator,
          status: "playing",
        };
        await sock.sendMessage(chat, { text: `♟️ TicTacToe started!\n${initiator.split("@")[0]} vs ${opponent.split("@")[0]}\n\n${tttBoardToText(games.ticTacToe[chat].board)}\n\nTo play: .tttmove <1-9>` });
        return;
      }

      if (command === "tttmove") {
        const game = games.ticTacToe[chat];
        if (!game) return await sock.sendMessage(chat, { text: "No active TicTacToe in this chat. Start with .ttt @user" });
        const move = parseInt(args[0]);
        if (!move || move < 1 || move > 9) return await sock.sendMessage(chat, { text: "Usage: .tttmove <1-9>" });
        const player = m.key.participant || m.key.remoteJid;
        if (player !== game.turn) return await sock.sendMessage(chat, { text: "It's not your turn." });
        if (game.board[move - 1]) return await sock.sendMessage(chat, { text: "Cell already taken." });
        const symbol = game.players[0] === player ? "X" : "O";
        game.board[move - 1] = symbol;
        game.turn = game.players.find((p) => p !== player);
        const wins = [
          [0,1,2],[3,4,5],[6,7,8],
          [0,3,6],[1,4,7],[2,5,8],
          [0,4,8],[2,4,6]
        ];
        let winner = null;
        for (const w of wins) {
          const [a,b,c] = w;
          if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
            winner = game.board[a];
            break;
          }
        }
        let boardText = tttBoardToText(game.board);
        if (winner) {
          const winnerJid = game.players[winner === "X" ? 0 : 1];
          const winnerNum = jidToNumber(winnerJid);
          await sock.sendMessage(chat, { text: `🎉 Game over!\n${boardText}\nWinner: @${winnerNum} (${winner})`, mentions: [winnerJid] });
          delete games.ticTacToe[chat];
          return;
        }
        if (game.board.every((c) => c)) {
          await sock.sendMessage(chat, { text: `🤝 Draw!\n${boardText}` });
          delete games.ticTacToe[chat];
          return;
        }
        await sock.sendMessage(chat, { text: `Next move:\n${boardText}\nTurn: @${jidToNumber(game.turn)}`, mentions: [game.turn] });
        return;
}
      // ---------- HANGMAN ----------
      if (command === "hangmanstart") {
        const words = ["apple","banana","computer","whatsapp"];
        const word = words[Math.floor(Math.random()*words.length)];
        games.hangman[chat] = {
          word,
          display: "_".repeat(word.length).split(""),
          tries: 6,
          guessed: [],
        };
        await sock.sendMessage(chat, { text: `🕹️ Hangman started! Word: ${games.hangman[chat].display.join(" ")}\nTries left: 6\nGuess with .hangmanguess <letter>` });
        return;
      }

      if (command === "hangmanguess") {
        const g = games.hangman[chat];
        if (!g) return await sock.sendMessage(chat, { text: "No hangman game active. Start with .hangmanstart" });
        const letter = args[0]?.toLowerCase();
        if (!letter || letter.length !== 1) return await sock.sendMessage(chat, { text: "Usage: .hangmanguess <letter>" });
        if (g.guessed.includes(letter)) return await sock.sendMessage(chat, { text: "You already guessed that letter." });
        g.guessed.push(letter);
        let found = false;
        for (let i=0;i<g.word.length;i++){
          if (g.word[i] === letter) { g.display[i] = letter; found = true; }
        }
        if (!found) g.tries -= 1;
        if (g.display.join("") === g.word) {
          await sock.sendMessage(chat, { text: `🎉 You won! The word was: ${g.word}` });
          delete games.hangman[chat];
          return;
        }
        if (g.tries <= 0) {
          await sock.sendMessage(chat, { text: `💀 You lost! The word was: ${g.word}` });
          delete games.hangman[chat];
          return;
        }
        await sock.sendMessage(chat, { text: `Word: ${g.display.join(" ")}\nTries left: ${g.tries}` });
        return;
      }

      // ---------- QUIZ ----------
      if (command === "quizstart") {
        const sample = { q: "What is 2+2?", choices: ["1","2","3","4"], answer: "4" };
        games.quizzes[chat] = { q: sample.q, choices: sample.choices, answer: sample.answer, active: true };
        await sock.sendMessage(chat, { text: `🧠 Quiz started!\nQ: ${sample.q}\nChoices: ${sample.choices.join(", ")}\nAnswer with: .quizanswer <answer>` });
        return;
      }
      if (command === "quizanswer") {
        const q = games.quizzes[chat];
        if (!q || !q.active) return await sock.sendMessage(chat, { text: "No active quiz. Start with .quizstart" });
        if (!arg) return await sock.sendMessage(chat, { text: "Usage: .quizanswer <answer>" });
        if (arg.trim().toLowerCase() === q.answer.toLowerCase()) {
          await sock.sendMessage(chat, { text: "✅ Correct!" });
        } else {
          await sock.sendMessage(chat, { text: `❌ Wrong. Correct answer is: ${q.answer}` });
        }
        delete games.quizzes[chat];
        return;
      }

      // ---------- UTILITIES ----------
      if (command === "echo") {
        await sock.sendMessage(chat, { text: arg || "Usage: .echo <text>" });
        return;
      }

      if (command === "reverse") {
        await sock.sendMessage(chat, { text: arg.split("").reverse().join("") || "Usage: .reverse <text>" });
        return;
      }

      if (command === "countchars") {
        await sock.sendMessage(chat, { text: `${arg.length} characters` });
        return;
      }

      // ---------- GROUP ADMIN ----------
      if (command === "leave") {
        if (!isGroup(chat)) {
          await sock.sendMessage(chat, { text: "This command only works in groups." });
          return;
        }
        try {
          await sock.groupLeave(chat);
          await sock.sendMessage(chat, { text: "Left group." }).catch(()=>{});
        } catch (e) {
          await sock.sendMessage(chat, { text: "❌ Failed to leave group." });
        }
        return;
      }

      // ---------- FALLBACK ----------
      await sock.sendMessage(chat, { text: `❓ Unknown command: ${command}\nType .menu for help.` });
    } catch (e) {
      console.error("messages.upsert error", e);
    }
  });

  // Auto-welcome for new contacts
  sock.ev.on("contacts.upsert", async (contacts) => {
    try {
      for (const c of contacts) {
        const num = c.id;
        if (!num) continue;
        if (!isGroup(num)) {
          await sock.sendMessage(num, { text: `👋 Hello! ${BOT_NAME} at your service.\nType .menu for commands.` });
        }
      }
    } catch (e) {
      console.log("Welcome message error:", e);
    }
  });

  console.log(`${BOT_NAME} starting...`);
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start bot with error handling
async function initializeBot() {
  try {
    await startBot();
  } catch (error) {
    console.error('Failed to start bot:', error);
    setTimeout(initializeBot, 10000);
  }
}

initializeBot();
