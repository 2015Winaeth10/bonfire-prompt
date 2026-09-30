require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events,
  SlashCommandBuilder
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

const BUILD = "26.01.0";
const PREFIX = "discord";

const dataDir = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDir, "bonfire.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function loadDatabase() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return { guilds: {}, locals: {} };
  }
}

const db = loadDatabase();

function saveDatabase() {
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2));
}

function ensureGuild(guildId) {
  db.guilds[guildId] ??= {
    global: {
      "settings": {},
      "channels": {},
      "roles": {},
      "welcome": {}
    }
  };
  return db.guilds[guildId];
}

function ensureLocal(guildId, userId) {
  const key = `${guildId}:${userId}`;
  db.locals[key] ??= {};
  return db.locals[key];
}

function normalizePath(cwd, input) {
  const parts = input.split("/").filter(Boolean);
  const current = cwd.split("/").filter(Boolean);
  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      if (current.length) current.pop();
    } else {
      current.push(part);
    }
  }
  return current.join("/");
}

function prompt(cwd) {
  return `${PREFIX}/${cwd || "local"}>`;
}

function getContext(guildId, userId, cwd) {
  const guild = ensureGuild(guildId);
  const local = ensureLocal(guildId, userId);
  const scope = cwd.startsWith("global") ? guild.global : local;
  const relative = cwd.split("/").slice(1).filter(Boolean);
  let node = scope;

  for (const part of relative) {
    if (!node || typeof node !== "object" || !node[part] || typeof node[part] !== "object") {
      return null;
    }
    node = node[part];
  }
  return node;
}

function listNode(node) {
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).map(([name, value]) =>
    typeof value === "object" ? `${name}/` : name
  );
}

function removeNode(node, name) {
  if (!node || typeof node !== "object" || !(name in node)) return false;
  delete node[name];
  return true;
}

async function executeCommand(interaction, state, commandLine) {
  const args = commandLine.trim().split(/\s+/).filter(Boolean);
  if (!args.length) return "";

  const command = args.shift().toLowerCase();
  const cwd = state.cwd;

  if (command === "help") {
    return [
      "Bonfire Prompt commands:",
      "  help                         Show this help",
      "  pwd                          Show current virtual directory",
      "  ls                           List virtual files",
      "  cd <path>                    Change virtual directory",
      "  mkdir <name>                 Create a virtual directory",
      "  touch <name>                 Create a virtual file",
      "  write <name> <text>          Write a virtual file",
      "  cat <name>                   Read a virtual file",
      "  rm <name>                    Remove a virtual item",
      "  clear                        Clear the terminal history",
      "  whoami                       Show your Discord identity",
      "  server                       Show server information",
      "  channels                    List Discord channels",
      "  roles                       List Discord roles",
      "  channel create <name>        Create a Discord text channel",
      "  channel delete <id>          Delete a Discord channel",
      "  role create <name>           Create a Discord role",
      "  role delete <id>             Delete a Discord role"
    ].join("\n");
  }

  if (command === "pwd") return `/${cwd}`;

  if (command === "clear") {
    state.history = [];
    return "";
  }

  if (command === "whoami") {
    return `${interaction.user.tag} (${interaction.user.id})`;
  }

  if (command === "server") {
    return [
      `Name: ${interaction.guild.name}`,
      `ID: ${interaction.guild.id}`,
      `Members: ${interaction.guild.memberCount}`
    ].join("\n");
  }

  if (command === "ls") {
    const node = getContext(interaction.guild.id, interaction.user.id, cwd);
    if (!node) return "ls: directory not found";
    const items = listNode(node);
    return items.length ? items.join("  ") : "(empty)";
  }

  if (command === "cd") {
    if (!args[0]) return "Usage: cd <path>";

    let target;
    if (args[0].startsWith("/")) {
      target = args[0].slice(1);
    } else {
      target = normalizePath(cwd, args[0]);
    }

    if (!target || target === "discord") {
      return "cd: access denied: discord is a virtual root placeholder";
    }

    if (!target.startsWith("local") && !target.startsWith("global")) {
      return "cd: invalid path";
    }

    const targetNode = getContext(interaction.guild.id, interaction.user.id, target);
    if (!targetNode) return `cd: no such directory: ${args[0]}`;

    state.cwd = target;
    return "";
  }

  if (["mkdir", "touch", "write", "cat", "rm"].includes(command)) {
    const targetName = args.shift();
    if (!targetName) return `Usage: ${command} <name>`;

    if (cwd.startsWith("global") && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return "Permission denied: Administrator is required for global changes.";
    }

    const node = getContext(interaction.guild.id, interaction.user.id, cwd);
    if (!node) return "Path not found.";

    if (command === "mkdir") {
      if (node[targetName]) return "mkdir: item already exists";
      node[targetName] = {};
      saveDatabase();
      return `created directory ${targetName}/`;
    }

    if (command === "touch") {
      if (node[targetName]) return "touch: item already exists";
      node[targetName] = "";
      saveDatabase();
      return `created file ${targetName}`;
    }

    if (command === "write") {
      const value = args.join(" ");
      if (!value) return "Usage: write <name> <text>";
      node[targetName] = value;
      saveDatabase();
      return `wrote ${value.length} bytes to ${targetName}`;
    }

    if (command === "cat") {
      if (!(targetName in node)) return `cat: no such file: ${targetName}`;
      if (typeof node[targetName] === "object") return `cat: ${targetName}: is a directory`;
      return String(node[targetName] || "(empty)");
    }

    if (command === "rm") {
      if (!removeNode(node, targetName)) return `rm: no such item: ${targetName}`;
      saveDatabase();
      return `removed ${targetName}`;
    }
  }

  if (command === "channels") {
    return interaction.guild.channels.cache
      .map(channel => `${channel.id}  #${channel.name}`)
      .slice(0, 50)
      .join("\n") || "(none)";
  }

  if (command === "roles") {
    return interaction.guild.roles.cache
      .map(role => `${role.id}  @${role.name}`)
      .slice(0, 50)
      .join("\n") || "(none)";
  }

  if (command === "channel") {
    const action = args.shift();
    if (action === "create") {
      const name = args.join("-").toLowerCase();
      if (!name) return "Usage: channel create <name>";
      const channel = await interaction.guild.channels.create({ name });
      return `created channel #${channel.name} (${channel.id})`;
    }
    if (action === "delete") {
      const id = args[0];
      const channel = interaction.guild.channels.cache.get(id);
      if (!channel) return "channel delete: channel not found";
      await channel.delete();
      return `deleted channel ${id}`;
    }
    return "Usage: channel create <name> | channel delete <id>";
  }

  if (command === "role") {
    const action = args.shift();
    if (action === "create") {
      const name = args.join(" ");
      if (!name) return "Usage: role create <name>";
      const role = await interaction.guild.roles.create({ name });
      return `created role @${role.name} (${role.id})`;
    }
    if (action === "delete") {
      const id = args[0];
      const role = interaction.guild.roles.cache.get(id);
      if (!role) return "role delete: role not found";
      await role.delete();
      return `deleted role ${id}`;
    }
    return "Usage: role create <name> | role delete <id>";
  }

  return `${command}: command not found`;
}

function terminalMessage(state) {
  const lines = state.history.length ? state.history : ["Bonfire Prompt initialized. Type 'help' to begin."];
  const text = [
    "Bonfire Prompt — Under the Unlicense License",
    `Build ${BUILD}`,
    "",
    ...lines
  ].join("\n");

  return ["```text", text.slice(-3800), "```"].join("\\n");
}

function makeEmbed(state) {
  return new EmbedBuilder()
    .setTitle("Bonfire Prompt")
    .setDescription(terminalMessage(state))
    .setFooter({ text: `Build ${BUILD} • Virtual filesystem` });
}

function botHasAdministrator(guild) {
  return Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.Administrator));
}

function makeButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("bonfire:command")
      .setLabel("Enviar comando")
      .setStyle(ButtonStyle.Primary)
  );
}

const sessions = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async ready => {
  const command = new SlashCommandBuilder()
    .setName("bonfire")
    .setDescription("Open the Bonfire Prompt terminal.");

  if (process.env.GUILD_ID) {
    await ready.application.commands.set([command], process.env.GUILD_ID);
    console.log("Registered /bonfire in GUILD_ID.");
  } else {
    await ready.application.commands.set([command]);
    console.log("Registered /bonfire globally.");
  }

  console.log(`Bonfire Prompt Build ${BUILD} logged in as ${ready.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "bonfire") {
      if (!interaction.guild) return interaction.reply({ content: "Bonfire Prompt only runs inside a server.", ephemeral: true });

      if (!botHasAdministrator(interaction.guild)) {
        return interaction.reply({
          content: "Bonfire Prompt cannot run: the bot needs the Administrator permission.",
          ephemeral: true
        });
      }

      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: "Administrator permission is required to use Bonfire Prompt.",
          ephemeral: true
        });
      }

      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const state = {
        cwd: "local",
        history: []
      };
      sessions.set(key, state);

      return interaction.reply({
        embeds: [makeEmbed(state)],
        components: [makeButton()]
      });
    }

    if (interaction.isButton() && interaction.customId === "bonfire:command") {
      if (!botHasAdministrator(interaction.guild)) {
        return interaction.reply({
          content: "Bonfire Prompt stopped: the bot needs the Administrator permission.",
          ephemeral: true
        });
      }

      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "Administrator permission is required.", ephemeral: true });
      }

      const key = `${interaction.guild.id}:${interaction.user.id}`;
      if (!sessions.has(key)) {
        sessions.set(key, { cwd: "local", history: [] });
      }

      const modal = new ModalBuilder()
        .setCustomId("bonfire:command_modal")
        .setTitle("Bonfire Prompt");

      const input = new TextInputBuilder()
        .setCustomId("command")
        .setLabel("Comando")
        .setPlaceholder("help")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(500);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === "bonfire:command_modal") {
      if (!botHasAdministrator(interaction.guild)) {
        return interaction.reply({
          content: "Bonfire Prompt stopped: the bot needs the Administrator permission.",
          ephemeral: true
        });
      }

      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "Administrator permission is required.", ephemeral: true });
      }

      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const state = sessions.get(key) || { cwd: "local", history: [] };
      const commandLine = interaction.fields.getTextInputValue("command").trim();

      state.history.push(`${prompt(state.cwd)} ${commandLine}`);

      const result = await executeCommand(interaction, state, commandLine);
      if (result) state.history.push(result);

      if (state.history.length > 80) state.history.splice(0, state.history.length - 80);

      return interaction.update({
        embeds: [makeEmbed(state)],
        components: [makeButton()]
      });
    }
  } catch (error) {
    console.error(error);
    const message = "Bonfire error: " + (error?.message || "unknown error");
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
