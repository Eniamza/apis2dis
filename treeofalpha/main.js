const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables if any
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const webhookPath = path.join(__dirname, '..', 'webhook.json');
let webhooks = {};
if (fs.existsSync(webhookPath)) {
    webhooks = JSON.parse(fs.readFileSync(webhookPath, 'utf8'));
}

const WEBHOOK_URL = webhooks.treeofalpha;
if (!WEBHOOK_URL) {
    console.error("Missing webhook URL for treeofalpha in webhook.json");
    process.exit(1);
}

const DATA_FILE = path.join(__dirname, 'sent_ids.json');

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

let sentIds = new Set(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));

function saveIds() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(sentIds), null, 2));
}

async function fetchNews() {
    console.log(`[${new Date().toISOString()}] Fetching Tree of Alpha news...`);
    try {
        const response = await fetch('https://news.treeofalpha.com/api/news?limit=50');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        // Reverse to process oldest first so that Discord gets them in chronological order
        const newItems = data.filter(item => !sentIds.has(item._id)).reverse();

        if (newItems.length === 0) {
            console.log("No new items found.");
            return;
        }

        for (const item of newItems) {
            await sendToDiscord(item);
            sentIds.add(item._id);
            saveIds();
            // Delay to prevent hitting rate limits
            await new Promise(r => setTimeout(r, 1000));
        }
    } catch (error) {
        console.error("Error fetching news:", error.message);
    }
}

async function sendToDiscord(item) {
    let title = item.title || "No Title";
    let description = null;

    // Discord embed title max limit is 256
    // Truncate if title is too long and put original title in description
    if (title.length > 250) {
        description = title;
        title = title.substring(0, 247) + "...";
    }

    const embed = {
        title: title,
        url: item.url || null,
        timestamp: new Date(item.time).toISOString(),
        author: {
            name: item.sourceName || item.source || "News"
        }
    };

    if (description) {
        embed.description = description;
    }

    if (item.image) {
        embed.image = { url: item.image };
    } else if (item.icon) {
        embed.thumbnail = { url: item.icon };
    }

    const payload = {
        embeds: [embed]
    };

    try {
        const res = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            console.error(`Failed to send to Discord: ${res.statusText}`);
            const text = await res.text();
            console.error(text);
        } else {
            console.log(`Sent to Discord: ${title}`);
        }
    } catch (error) {
        console.error("Error sending to Discord:", error.message);
    }
}

// Run immediately
fetchNews();

// Run every 30 minutes (30 * 60 * 1000 milliseconds)
setInterval(fetchNews, 30 * 60 * 1000);
