/* ================= IMPORTS ================= */
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

const transcripts = require("discord-html-transcripts");
const mc = require("minecraft-server-util");
require("dotenv").config();

/* ================= CONFIG ================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});

const STAFF_ROLE = "1463732923399143425";
const CEO_ROLE = "1475900068744794327";
const SUPPORT_ROLE = process.env.SUPPORT_ROLE;
const AI_CONTENT_CHANNEL_ID =
  process.env.AI_CONTENT_CHANNEL_ID || "1482162863672918037";

const cooldown = new Map();
const aiDisabledChannels = new Set();

let manutencao = false;
let statusMessage = null;
let ultimaAtualizacao = Date.now();
let faqCache = [];

/* ================= UTIL ================= */

function isStaff(member) {
  return (
    member?.roles?.cache?.has(STAFF_ROLE) || member?.roles?.cache?.has(CEO_ROLE)
  );
}

function isTicketChannel(channel) {
  return (
    !!channel &&
    channel.type === ChannelType.GuildText &&
    channel.parentId === process.env.TICKET_CATEGORY_ID &&
    typeof channel.topic === "string" &&
    channel.topic.includes("owner:")
  );
}

function getTicketOwnerId(channel) {
  if (!channel?.topic) return null;
  const match = channel.topic.match(/owner:(\d+)/);
  return match ? match[1] : null;
}

function getSafeUsername(username) {
  return username
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
}

function safeSetImage(embed, url) {
  if (url && /^https?:\/\//i.test(url)) {
    embed.setImage(url);
  }
  return embed;
}

function tempoRelativo() {
  const segundos = Math.floor((Date.now() - ultimaAtualizacao) / 1000);
  if (segundos < 60) return "Atualizado agora";
  const minutos = Math.floor(segundos / 60);
  if (minutos === 1) return "Atualizado há 1 minuto";
  return `Atualizado há ${minutos} minutos`;
}

async function sendCommandLog(guild, user, commandName, details = "") {
  try {
    const channel = await guild.channels.fetch(process.env.COMMAND_LOG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle("Log de comando")
      .addFields(
        { name: "Nick", value: user.username || "Desconhecido" },
        { name: "Comando", value: commandName },
        { name: "Detalhes", value: details || "Sem detalhes" }
      )
      .setColor(0xffcc00)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.log("Erro log:", error);
  }
}

/* ================= ARCHIVE ================= */

async function archiveTicket(channel, guild, reasonText) {
  const attachment = await transcripts.createTranscript(channel, {
    filename: `transcript-${channel.name}.html`,
  });

  const logChannel = await guild.channels.fetch(process.env.LOG_CHANNEL_ID);
  if (logChannel && logChannel.isTextBased()) {
    await logChannel.send({
      content: `📁 ${reasonText}: ${channel.name}`,
      files: [attachment],
    });
  }

  await channel.setParent(process.env.ARCHIVE_CATEGORY_ID);
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, {
    SendMessages: false,
  });
}

/* ================= IA ================= */

async function loadFaqCache() {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(AI_CONTENT_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const messages = await channel.messages.fetch({ limit: 100 });

    faqCache = messages
      .filter(m => !m.author.bot && m.content.trim().length > 0)
      .map(m => m.content.trim());

    console.log(`FAQ carregada: ${faqCache.length}`);
  } catch (err) {
    console.log("Erro IA:", err);
  }
}

function extractKeywords(text) {
  return text.toLowerCase().split(" ").filter(w => w.length > 2);
}

function findBestFaqAnswer(userMessage) {
  const userWords = extractKeywords(userMessage);
  let best = null;
  let scoreMax = 0;

  for (const item of faqCache) {
    const words = extractKeywords(item);
    const score = userWords.filter(w => words.includes(w)).length;

    if (score > scoreMax) {
      scoreMax = score;
      best = item;
    }
  }

  return scoreMax >= 2 ? best : null;
}

async function handleAiResponse(message) {
  if (message.author.bot) return;
  if (!isTicketChannel(message.channel)) return;
  if (aiDisabledChannels.has(message.channel.id)) return;
  if (isStaff(message.member)) return;

  const resposta = findBestFaqAnswer(message.content);
  if (!resposta) return;

  await message.reply(`${resposta}\n\nClique em **Chamar Suporte** se precisar.`);
}

/* ================= READY ================= */

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  try {
    await registerCommands();
    await loadFaqCache();
    await garantirPainel();
    await atualizarStatus();

    setInterval(atualizarStatus, 600000);
    setInterval(loadFaqCache, 300000);

  } catch (err) {
    console.log("Erro no ready:", err);
  }
});

/* ================= INTERACTION ================= */

client.on("interactionCreate", async (interaction) => {
  try {

    /* MENU */
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_menu") {
        return await createTicket(interaction, interaction.values[0]);
      }
    }

    /* BOTÕES */
    if (interaction.isButton()) {
      const channel = interaction.channel;
      if (!isTicketChannel(channel)) return;

      const ownerId = getTicketOwnerId(channel);

      if (interaction.customId === "chamar_suporte") {
        aiDisabledChannels.add(channel.id);
        await channel.send(`<@&${SUPPORT_ROLE}> suporte chamado.`);
        return interaction.reply({
          content: "Suporte acionado.",
          ephemeral: true
        });
      }
    }

    /* COMANDOS */
    if (interaction.isChatInputCommand()) {

      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content: "❌ Apenas STAFF ou CEO podem usar.",
          ephemeral: true
        });
      }

      if (interaction.commandName === "agradecer") {
        return comandoAgradecer(interaction);
      }
    }

  } catch (err) {
    console.log("Erro interaction:", err);
  }
});

/* ================= IA EVENT ================= */

client.on("messageCreate", async (message) => {
  try {
    await handleAiResponse(message);
  } catch (err) {
    console.log("Erro IA:", err);
  }
});

/* ================= BOOST ================= */

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (!oldMember.premiumSince && newMember.premiumSince) {

      const canal = await newMember.guild.channels.fetch("1485518997373059122");
      if (!canal || !canal.isTextBased()) return;

      const embed = new EmbedBuilder()
        .setTitle("💜 Novo Boost!")
        .setDescription(`${newMember} obrigado pelo boost!`)
        .setColor(0x8b5cf6);

      await canal.send({ embeds: [embed] });
    }
  } catch (err) {
    console.log("Erro boost:", err);
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);