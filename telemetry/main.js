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

const WEBHOOK_URL = webhooks.telemetry;
if (!WEBHOOK_URL) {
    console.error("Missing webhook URL for telemetry in webhook.json");
    process.exit(1);
}

function formatNumber(num) {
    const val = Number(num);
    if (isNaN(val)) return num;
    
    // Convert to absolute to check magnitude, but keep original sign
    const absVal = Math.abs(val);
    const sign = val < 0 ? '-' : '';

    if (absVal >= 1e9) return sign + (absVal / 1e9).toFixed(2) + 'b';
    if (absVal >= 1e6) return sign + (absVal / 1e6).toFixed(2) + 'm';
    if (absVal >= 1e3) return sign + (absVal / 1e3).toFixed(2) + 'k';
    return sign + absVal.toFixed(2);
}

async function fetchTelemetry() {
    console.log(`[${new Date().toISOString()}] Fetching Telemetry Whale Moves...`);
    try {
        const response = await fetch('https://app.telemetry.io/data/discovery/whale_moves');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        let data = await response.json();
        
        // Wait, what if data is empty or not an array?
        if (!Array.isArray(data)) {
            console.error("Expected array from telemetry api, got:", typeof data);
            return;
        }

        if (data.length === 0) {
            console.log("No data returned.");
            return;
        }

        // Loop array in chunks of 2
        for (let i = 0; i < data.length; i += 2) {
            const chunk = data.slice(i, i + 2);
            
            const embed = {
                title: `Telemetry Whale Moves (${i + 1} to ${i + chunk.length} of ${data.length})`,
                color: 0x00ff99,
                timestamp: new Date().toISOString(),
                fields: []
            };

            for (const coin of chunk) {
                const symbol = coin.token_symbol || 'Unknown';
                const name = coin.token_name || 'Unknown';
                const mint = coin.mint ? `\n**Mint:** [${coin.mint.substring(0,8)}...](https://solscan.io/token/${coin.mint})` : '';
                
                // Construct compact representation
                const mcap = `**MCAP:** $${formatNumber(coin.current_market_cap_usd)}`;
                const whales = `**Whales:** 15m: ${coin.whales_15m} | 1h: ${coin.whales_1h} | 6h: ${coin.whales_6h} | 24h: ${coin.whales_24h}`;
                const trades = `**Trades:** 15m: ${coin.trades_15m} | 1h: ${coin.trades_1h} | 6h: ${coin.trades_6h} | 24h: ${coin.trades_24h}`;
                const vol = `**Vol:** 15m: $${formatNumber(coin.volume_usd_15m)} | 1h: $${formatNumber(coin.volume_usd_1h)} | 6h: $${formatNumber(coin.volume_usd_6h)} | 24h: $${formatNumber(coin.volume_usd_24h)}`;

                // field value limit is 1024, our string is ~200 chars.
                const fieldValue = `${mcap}\n${whales}\n${trades}\n${vol}${mint}`;
                
                embed.fields.push({
                    name: `${name} ($${symbol})`,
                    value: fieldValue,
                    inline: false
                });
            }

            const payload = { embeds: [embed] };
            
            const res = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                console.error(`Failed to send chunk to Discord: ${res.statusText}`);
                const errText = await res.text();
                console.error(errText);
            } else {
                console.log(`Sent chunk ${i / 5 + 1} to Discord.`);
            }

            // Always add a 2 second delay between each webhook send to avoid Discord's rate limits
            await new Promise(r => setTimeout(r, 2000));
        }

    } catch (error) {
        console.error("Error fetching telemetry:", error.message);
    }
}

// Run immediately
fetchTelemetry();

// Run every hour (60 * 60 * 1000 milliseconds)
setInterval(fetchTelemetry, 60 * 60 * 1000);
