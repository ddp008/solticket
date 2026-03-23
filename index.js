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

const cooldown = new Map();
const aiDisabledChannels = new Set();

let manutencao = false;
let statusMessage = null;
let ultimaAtualizacao = Date.now();
let faqCache = [];

const atividade = {};

/* =========================================================
   FUNÇÕES UTILITÁRIAS
========================================================= */

function isStaff(member) {
  return (
    member?.roles?.cache?.has(STAFF_ROLE) || member?.roles?.cache?.has(CEO_ROLE)
  );
}

function getSafeUsername(username) {
  return username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
}

/* =========================================================
   TICKETS
========================================================= */

function ticketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("assumir_ticket").setLabel("Assumir").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("resolver_ticket").setLabel("Resolvido").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("cancelar_ticket").setLabel("Cancelar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("fechar_ticket").setLabel("Fechar").setStyle(ButtonStyle.Danger)
  );
}

function aiSupportButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("chamar_suporte")
      .setLabel("Chamar Suporte")
      .setStyle(ButtonStyle.Secondary)
  );
}

async function createTicket(interaction, tipo) {
  const safeName = getSafeUsername(interaction.user.username);

  const channel = await interaction.guild.channels.create({
    name: `${tipo}-${safeName}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: STAFF_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: CEO_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    ],
  });

  await channel.send({
    content: `<@&${STAFF_ROLE}>`,
    embeds: [new EmbedBuilder().setTitle(`Ticket ${tipo}`).setDescription(`Olá ${interaction.user}`)],
    components: [ticketButtons(), aiSupportButton()],
  });

  return interaction.reply({ content: `Ticket criado: ${channel}`, ephemeral: true });
}

/* =========================================================
   STATUS
========================================================= */

async function atualizarStatus() {
  try {
    const res = await mc.status(process.env.MC_SERVER_IP, parseInt(process.env.MC_SERVER_PORT));
    console.log("ONLINE:", res.players.online);
  } catch {
    console.log("OFFLINE");
  }
}

/* =========================================================
   IA
========================================================= */

function responderIA(msg) {
  const text = msg.toLowerCase();
  if (text.includes("ip")) return "O IP está no painel.";
  return null;
}

/* =========================================================
   COMANDOS
========================================================= */

async function comandoAgradecer(interaction) {
  const tipo = interaction.options.getString("tipo");
  const user = interaction.options.getUser("user");
  const valor = interaction.options.getString("valor");

  const canal = await interaction.guild.channels.fetch("1485518997373059122");

  let mensagem = "";

  if (tipo === "boost") mensagem = `✨ Obrigado ${user} pelo boost!`;
  if (tipo === "doacao") mensagem = `💰 Obrigado ${user} pela doação ${valor || ""}!`;

  await canal.send(mensagem);
  return interaction.reply({ content: "Enviado!", ephemeral: true });
}

async function comandoAtividade(interaction) {
  const nick = interaction.options.getString("nick");

  if (!atividade[nick]) return interaction.reply("Sem dados");

  return interaction.reply(`Tempo: ${atividade[nick].total}`);
}

/* =========================================================
   EVENTOS
========================================================= */

client.once("ready", () => {
  console.log(`Online como ${client.user.tag}`);
  setInterval(atualizarStatus, 600000);
});

client.on("interactionCreate", async (interaction) => {
  try {

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "ticket_menu") {
        return createTicket(interaction, interaction.values[0]);
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === "chamar_suporte") {
        await interaction.channel.send(`<@&${SUPPORT_ROLE}> suporte chamado`);
        return interaction.reply({ content: "Suporte chamado", ephemeral: true });
      }
    }

    if (interaction.isChatInputCommand()) {

      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content: "❌ Apenas STAFF ou CEO podem usar.",
          ephemeral: true,
        });
      }

      if (interaction.commandName === "agradecer") return comandoAgradecer(interaction);
      if (interaction.commandName === "atividade") return comandoAtividade(interaction);
    }

  } catch (err) {
    console.log(err);
  }
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const resposta = responderIA(msg.content);
  if (resposta) msg.reply(resposta);
});

client.login(process.env.TOKEN);