import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import schedule from 'node-schedule'
import moment from 'moment-timezone'
import fs from 'fs'

const IST = 'Asia/Kolkata'
const messageFile = './scheduled.json'

function loadMessages() {
    return fs.existsSync(messageFile) ? JSON.parse(fs.readFileSync(messageFile, 'utf-8')) : []
}

function saveMessages(data) {
    fs.writeFileSync(messageFile, JSON.stringify(data, null, 2))
}

function scheduleMessage(sock, number, message) {
    const time = moment.tz('09:00', 'HH:mm', IST)
    const [hour, minute] = [time.hour(), time.minute()]

    schedule.scheduleJob({ hour, minute, tz: IST }, async () => {
        try {
            await sock.sendMessage(number + '@s.whatsapp.net', { text: message })
            console.log(`Message sent to ${number}: ${message}`)
        } catch (err) {
            console.error(`Failed to send message:`, err)
        }
    })
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update
        if (qr) {
            console.log('\nScan this QR code with WhatsApp to login.\n')
        }
        if (connection === 'open') {
            console.log('✅ Bot is connected to WhatsApp.')
        }
    })

    // Load and schedule existing messages
    const scheduled = loadMessages()
    for (const { number, message } of scheduled) {
        scheduleMessage(sock, number, message)
    }

    // Command handler
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0]
        if (!msg?.message?.conversation) return

        const text = msg.message.conversation.trim()
        if (!text.startsWith('.set')) return

        const parts = text.split(' ')
        if (parts.length < 3) return

        const number = parts[1].replace('+', '').trim()
        const message = parts.slice(2).join(' ')

        // Save
        const newEntry = { number, message }
        scheduled.push(newEntry)
        saveMessages(scheduled)

        // Schedule
        scheduleMessage(sock, number, message)

        // Confirm
        await sock.sendMessage(msg.key.remoteJid, {
            text: `✅ Message scheduled for ${number} at 9:00 AM IST daily:\n\n"${message}"`
        })

        console.log(`New schedule set for ${number}: ${message}`)
    })
}

startBot()
