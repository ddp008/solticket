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

/* =========================================================
   CONFIG
========================================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const STAFF_ROLE = "1463732923399143425";
const CEO_ROLE = "1475900068744794327";
const SUPPORT_ROLE = process.env.SUPPORT_ROLE;

let statusMessage = null;
let ultimaAtualizacao = Date.now();

/* =========================================================
   FUNÇÕES
========================================================= */

function painelEmbed() {
  return new EmbedBuilder()
    .setTitle("🌳 Solstice • Central de Atendimento")
    .setDescription("Selecione uma opção abaixo para abrir um ticket.")
    .setColor(0x8b5cf6);
}

function painelMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_menu")
      .setPlaceholder("Escolha o tipo")
      .addOptions([
        { label: "Dúvidas", value: "duvidas", emoji: "❓" },
        { label: "Suporte", value: "suporte", emoji: "🛠️" },
        { label: "Lore", value: "historia", emoji: "📜" },
        { label: "Doação", value: "doacao", emoji: "💰" },
        { label: "Entrevista", value: "entrevista", emoji: "🎤" },
      ])
  );
}

async function garantirPainel() {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const canal = await guild.channels.fetch(process.env.PANEL_CHANNEL_ID);

    console.log("Enviando painel...");

    await canal.send({
      embeds: [painelEmbed()],
      components: [painelMenu()],
    });

    console.log("Painel enviado");
  } catch (err) {
    console.log("ERRO PAINEL:", err);
  }
}

async function atualizarStatus() {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const canal = await guild.channels.fetch(process.env.STATUS_CHANNEL_ID);

    console.log("Atualizando status...");

    let status = "🔴 Offline";

    try {
      const res = await mc.status(
        process.env.MC_SERVER_IP,
        parseInt(process.env.MC_SERVER_PORT)
      );
      status = "🟢 Online";
    } catch {}

    const embed = new EmbedBuilder()
      .setTitle("🌳 Status do Servidor")
      .setDescription(status)
      .setColor(status === "🟢 Online" ? 0x3ba55d : 0xed4245);

    if (!statusMessage) {
      statusMessage = await canal.send({ embeds: [embed] });
    } else {
      await statusMessage.edit({ embeds: [embed] });
    }

    console.log("Status atualizado");
  } catch (err) {
    console.log("ERRO STATUS:", err);
  }
}

/* =========================================================
   EVENTOS
========================================================= */

client.once("ready", async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);

  // TESTE DIRETO
  const guild = await client.guilds.fetch(process.env.GUILD_ID);

  const painel = await guild.channels.fetch(process.env.PANEL_CHANNEL_ID);
  const status = await guild.channels.fetch(process.env.STATUS_CHANNEL_ID);

  console.log("PAINEL:", painel?.name);
  console.log("STATUS:", status?.name);

  await painel.send("✅ TESTE PAINEL OK");
  await status.send("✅ TESTE STATUS OK");

  await garantirPainel();
  await atualizarStatus();

  setInterval(atualizarStatus, 600000);
});

/* =========================================================
   INTERAÇÕES
========================================================= */

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_menu") {
        return interaction.reply({
          content: `Ticket de ${interaction.values[0]} criado!`,
          ephemeral: true,
        });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "chamar_suporte") {
        await interaction.channel.send(`<@&${SUPPORT_ROLE}> suporte chamado`);
        return interaction.reply({ content: "Suporte chamado", ephemeral: true });
      }
    }

  } catch (err) {
    console.log("ERRO INTERAÇÃO:", err);
  }
});

client.login(process.env.TOKEN);