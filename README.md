# bonfire-prompt

A terminal for Discord built into discord.js.

## Bonfire Prompt

```text
Bonfire Prompt — Under the Unlicense License
Build 26.01.0

discord/local>
```

Bonfire uses a **virtual filesystem**. It never exposes or navigates the operating system filesystem of the machine running the bot.

### Virtual directories

- `discord/` — virtual root placeholder. It cannot be entered.
- `discord/local/` — private per-user space.
- `discord/global/` — server-wide shared space.

The bot must have the **Administrator** permission to run Bonfire Prompt. Users also need Administrator permission to operate the terminal.

### Setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Create a `.env` file:

```env
DISCORD_TOKEN=your_bot_token
# Optional: use a guild ID for instant /bonfire registration while developing.
GUILD_ID=your_server_id
```

4. Invite the bot with the required bot/application scopes and give it the **Administrator** permission.
5. Run `npm start`.

If `GUILD_ID` is set, `/bonfire` is registered in that server. Without it, the command is registered globally and may take some time to appear.

### Commands

```text
help
pwd
ls
cd <path>
mkdir <name>
touch <name>
write <name> <text>
cat <name>
rm <name>
clear
whoami
server
channels
roles
channel create <name>
channel delete <id>
role create <name>
role delete <id>
```

The terminal history is edited into the Bonfire Prompt message after each command.

### Storage

Bonfire's persistent data is stored in its own `data/bonfire.json` file. This is application storage for the virtual filesystem; it is **not** exposed as a terminal filesystem to Discord users.
