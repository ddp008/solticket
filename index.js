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
   1) CONFIGURAÇÕES
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
const AI_CONTENT_CHANNEL_ID =
  process.env.AI_CONTENT_CHANNEL_ID || "1482162863672918037";

const cooldown = new Map();
const aiDisabledChannels = new Set();

let manutencao = false;
let statusMessage = null;
let ultimaAtualizacao = Date.now();
let faqCache = [];

/* =========================================================
   2) FUNÇÕES UTILITÁRIAS
========================================================= */

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
        { name: "Comando", value: commandName || "Desconhecido" },
        { name: "Detalhes", value: details || "Sem detalhes" }
      )
      .setColor(0xffcc00)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.log("Erro ao enviar log de comando:", error);
  }
}

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

async function loadFaqCache() {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const faqChannel = await guild.channels.fetch(AI_CONTENT_CHANNEL_ID);

    if (!faqChannel || !faqChannel.isTextBased()) {
      console.log("Canal de conteúdo da IA não encontrado.");
      return;
    }

    const messages = await faqChannel.messages.fetch({ limit: 100 });

    faqCache = messages
      .filter((m) => !m.author.bot && m.content.trim().length > 0)
      .map((m) => m.content.trim());

    console.log(`FAQ carregada: ${faqCache.length} itens.`);
  } catch (error) {
    console.log("Erro ao carregar FAQ da IA:", error);
  }
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractKeywords(text) {
  const stopwords = new Set([
    "a",
    "o",
    "e",
    "de",
    "do",
    "da",
    "dos",
    "das",
    "para",
    "por",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "um",
    "uma",
    "com",
    "que",
    "como",
    "qual",
    "quais",
    "me",
    "minha",
    "meu",
    "se",
    "eu",
    "vou",
    "tem",
    "tenho",
    "queria",
    "preciso",
  ]);

  return normalizeText(text)
    .split(" ")
    .filter((word) => word.length > 2 && !stopwords.has(word));
}

function findBestFaqAnswer(userMessage) {
  const userKeywords = extractKeywords(userMessage);
  if (userKeywords.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const item of faqCache) {
    const itemKeywords = extractKeywords(item);
    const overlap = userKeywords.filter((word) => itemKeywords.includes(word)).length;

    if (overlap > bestScore) {
      bestScore = overlap;
      bestMatch = item;
    }
  }

  if (bestScore < 2) return null;
  return bestMatch;
}

/* =========================================================
   3) PAINEL DE TICKETS
========================================================= */

function painelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("🌳 Solstice • Central de Atendimento")
    .setDescription(`
Leia com atenção antes de abrir um ticket.

Abra ticket **somente se realmente precisar da staff**.

**🛠️ Suporte Técnico**
Use para bugs, erros, problemas de acesso ou falhas no servidor.

**📜 História / Lore**
Use se deseja ajuda com sua lore ou possui dúvida sobre a história do servidor.

**💰 Doação / Requisito**
Use caso queira apoiar o servidor com uma doação voluntária ou tratar algum requisito/proposta.

**🎤 Entrevista**
Use para agendar entrevista com a equipe.

**Não abra ticket para assuntos irrelevantes.**
Tickets sem necessidade podem ser encerrados.
`)
    .setColor(0x8b5cf6)
    .setFooter({ text: "Solstice SMP • Sistema oficial de atendimento" });

  return safeSetImage(embed, process.env.TICKET_IMAGE_URL);
}

function painelMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_menu")
      .setPlaceholder("Escolha o tipo de atendimento")
      .addOptions(
        {
          label: "Suporte Técnico",
          value: "suporte",
          emoji: "🛠️",
          description: "Problemas, bugs ou erros no servidor",
        },
        {
          label: "História / Lore",
          value: "historia",
          emoji: "📜",
          description: "Ajuda na lore ou dúvidas da história",
        },
        {
          label: "Doação / Requisito",
          value: "doacao",
          emoji: "💰",
          description: "Doação voluntária ou requisito/proposta",
        },
        {
          label: "Entrevista",
          value: "entrevista",
          emoji: "🎤",
          description: "Agendar entrevista com a staff",
        }
      )
  );
}

async function garantirPainel() {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const channel = await guild.channels.fetch(process.env.PANEL_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) return;

  const messages = await channel.messages.fetch({ limit: 20 });

  const existingPanel = messages.find(
    (m) =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0].title &&
      m.embeds[0].title.includes("Central de Atendimento")
  );

  if (existingPanel) return;

  await channel.send({
    embeds: [painelEmbed()],
    components: [painelMenu()],
  });
}

/* =========================================================
   4) TICKETS
========================================================= */

function ticketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("assumir_ticket")
      .setLabel("Assumir")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("resolver_ticket")
      .setLabel("Ticket Resolvido")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("cancelar_ticket")
      .setLabel("Cancelar Ticket")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("fechar_ticket")
      .setLabel("Fechar")
      .setStyle(ButtonStyle.Danger)
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

function getTicketMessage(tipo, userMention) {
  switch (tipo) {
    case "suporte":
      return `
Olá ${userMention}

Descreva **detalhadamente** o problema técnico.

Informe:

• O que aconteceu  
• Onde aconteceu  
• Se apareceu algum erro  

Quanto mais detalhes você fornecer, mais rápido a equipe poderá ajudar.
`;

    case "historia":
      return `
Olá ${userMention}

Este ticket é destinado a **assuntos relacionados à história (lore)** do servidor.

Informe abaixo:

📜 Se você deseja **ajuda para desenvolver sua lore**  
ou  
📖 Se possui **dúvida sobre a história do servidor**

Explique o máximo possível para que possamos ajudar.
`;

    case "doacao":
      return `
Olá ${userMention}

Este ticket é para **apoio ao servidor**.

Informe abaixo se o seu caso é:

💰 **Doação**  
ou  
📦 **Requisito**

Explique sua intenção com clareza para que a equipe possa analisar.
`;

    case "entrevista":
      return `
Olá ${userMention}

Este ticket é para **agendamento de entrevista com a staff**.

Informe abaixo:

📅 **Data disponível**  
⏰ **Horário disponível**

Exemplo:

• Dia: 15/03  
• Horário: 21:00

A equipe irá analisar e confirmar o agendamento.
`;

    default:
      return `
Olá ${userMention}

Explique detalhadamente o motivo do ticket.
`;
  }
}

function getTicketTitle(tipo) {
  switch (tipo) {
    case "suporte":
      return "Suporte Técnico";
    case "historia":
      return "História / Lore";
    case "doacao":
      return "Doação / Requisito";
    case "entrevista":
      return "Entrevista";
    default:
      return "Ticket";
  }
}

function getTicketPrefix(tipo) {
  switch (tipo) {
    case "suporte":
      return "suporte";
    case "historia":
      return "lore";
    case "doacao":
      return "apoio";
    case "entrevista":
      return "entrevista";
    default:
      return "ticket";
  }
}

async function createTicket(interaction, tipo) {
  const existing = interaction.guild.channels.cache.find(
    (c) => c.topic && c.topic.includes(`owner:${interaction.user.id}`)
  );

  if (existing) {
    return interaction.reply({
      content: `Você já possui um ticket aberto: ${existing}`,
      ephemeral: true,
    });
  }

  const userId = interaction.user.id;
  const lastUse = cooldown.get(userId);
  const remaining = lastUse ? lastUse - Date.now() : 0;

  if (remaining > 0) {
    return interaction.reply({
      content: `⏳ Aguarde ${Math.ceil(
        remaining / 1000
      )} segundos para abrir outro ticket.`,
      ephemeral: true,
    });
  }

  cooldown.set(userId, Date.now() + 60000);

  const safeName = getSafeUsername(interaction.user.username);
  const channelName = `${getTicketPrefix(tipo)}-${safeName}`;

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: process.env.TICKET_CATEGORY_ID,
    topic: `owner:${interaction.user.id}|tipo:${tipo}`,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: STAFF_ROLE,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
      {
        id: CEO_ROLE,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ],
  });

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket • ${getTicketTitle(tipo)}`)
    .setDescription(getTicketMessage(tipo, `${interaction.user}`))
    .setColor(0x8b5cf6)
    .setFooter({ text: "Solstice • Atendimento" });

  safeSetImage(embed, process.env.TICKET_IMAGE_URL);

  await channel.send({
    content: `<@&${STAFF_ROLE}>`,
    embeds: [embed],
    components: [ticketButtons(), aiSupportButton()],
  });

  await sendCommandLog(
    interaction.guild,
    interaction.user,
    "abrir_ticket",
    `Tipo: ${tipo} | Canal: #${channel.name}`
  );

  return interaction.reply({
    content: `Seu ticket foi criado: ${channel}`,
    ephemeral: true,
  });
}

/* =========================================================
   5) COMANDOS /add /remove /manutencao
========================================================= */

async function registerCommands() {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);

  await guild.commands.set([
    {
      name: "add",
      description: "Adicionar uma pessoa ao ticket atual",
      options: [
        {
          name: "user",
          description: "Usuário a ser adicionado",
          type: 6,
          required: true,
        },
      ],
    },
    {
      name: "remove",
      description: "Remover uma pessoa do ticket atual",
      options: [
        {
          name: "user",
          description: "Usuário a ser removido",
          type: 6,
          required: true,
        },
      ],
    },
    {
      name: "manutencao",
      description: "Ativar ou desativar o modo manutenção no painel de status",
      options: [
        {
          name: "modo",
          description: "on ou off",
          type: 3,
          required: true,
          choices: [
            { name: "on", value: "on" },
            { name: "off", value: "off" },
          ],
        },
      ],
    },
  ]);
}

/* =========================================================
   6) STATUS DO SERVIDOR
========================================================= */

async function atualizarStatus() {
  ultimaAtualizacao = Date.now();

  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(process.env.STATUS_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    let status = "🔴 Offline";
    let online = 0;
    let max = 0;
    let lista = "Nenhum jogador online.";

    if (manutencao) {
      status = "🟡 Em manutenção";
    } else {
      try {
        const res = await mc.status(
          process.env.MC_SERVER_IP,
          parseInt(process.env.MC_SERVER_PORT)
        );

        status = "🟢 Online";
        online = res.players.online;
        max = res.players.max;

        if (res.players.sample && res.players.sample.length > 0) {
          lista = res.players.sample.map((p) => `• ${p.name}`).join("\n");
        }
      } catch {
        status = "🔴 Offline";
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🌳 Solstice • Status do Servidor")
      .setColor(
        status === "🟢 Online"
          ? 0x3ba55d
          : status === "🟡 Em manutenção"
          ? 0xf1c40f
          : 0xed4245
      )
      .addFields(
        {
          name: "Status",
          value: `\`\`\`${status}\`\`\``,
          inline: true,
        },
        {
          name: "Jogadores",
          value: `\`\`\`${online}/${max}\`\`\``,
          inline: true,
        },
        {
          name: "IP do Servidor",
          value: `\`\`\`${process.env.MC_SERVER_IP}\`\`\``,
        },
        {
          name: "Jogadores Online",
          value:
            lista.length > 1000 ? `${lista.slice(0, 1000)}...` : lista,
        }
      )
      .setFooter({
        text: `🔄 ${tempoRelativo()}`,
      });

    safeSetImage(embed, process.env.STATUS_IMAGE_URL);

    if (!statusMessage) {
      const msgs = await channel.messages.fetch({ limit: 10 });
      statusMessage = msgs.find(
        (m) =>
          m.author.id === client.user.id &&
          m.embeds.length > 0 &&
          m.embeds[0].title &&
          m.embeds[0].title.includes("Status do Servidor")
      );

      if (!statusMessage) {
        statusMessage = await channel.send({ embeds: [embed] });
      } else {
        await statusMessage.edit({ embeds: [embed] });
      }
    } else {
      await statusMessage.edit({ embeds: [embed] });
    }
  } catch (err) {
    console.log("Erro status:", err);
  }
}

/* =========================================================
   7) IA DE RESPOSTA
========================================================= */

async function handleAiResponse(message) {
  if (message.author.bot) return;
  if (!isTicketChannel(message.channel)) return;
  if (aiDisabledChannels.has(message.channel.id)) return;

  if (isStaff(message.member)) return;

  const bestAnswer = findBestFaqAnswer(message.content);

  if (!bestAnswer) return;

  await message.reply(
    `${bestAnswer}\n\nSe isso não resolver, use o botão **Chamar Suporte**.`
  );
}

/* =========================================================
   8) EVENTOS
========================================================= */

client.once("ready", async () => {
  console.log(`Bot online como ${client.user.tag}`);

  await registerCommands();
  await loadFaqCache();
  await garantirPainel();
  await atualizarStatus();

  setInterval(atualizarStatus, 60000);
  setInterval(loadFaqCache, 300000);
});

client.on("interactionCreate", async (interaction) => {
  try {
    /* ---------- MENU DE TICKET ---------- */
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "ticket_menu"
    ) {
      return await createTicket(interaction, interaction.values[0]);
    }

    /* ---------- BOTÕES ---------- */
    if (interaction.isButton()) {
      const channel = interaction.channel;

      if (!isTicketChannel(channel)) {
        return interaction.reply({
          content: "Este botão só pode ser usado em tickets.",
          ephemeral: true,
        });
      }

      const ownerId = getTicketOwnerId(channel);

      if (interaction.customId === "assumir_ticket") {
        await sendCommandLog(
          interaction.guild,
          interaction.user,
          "assumir_ticket",
          `Canal: #${channel.name}`
        );

        return interaction.reply({
          content: `${interaction.user} assumiu este ticket.`,
        });
      }

      if (interaction.customId === "resolver_ticket") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ Apenas STAFF ou CEO podem resolver tickets.",
            ephemeral: true,
          });
        }

        await channel.send("✅ Ticket marcado como resolvido.");

        await sendCommandLog(
          interaction.guild,
          interaction.user,
          "resolver_ticket",
          `Canal: #${channel.name}`
        );

        await archiveTicket(channel, interaction.guild, "Ticket resolvido");

        return interaction.reply({
          content: "✅ Ticket resolvido e arquivado.",
          ephemeral: true,
        });
      }

      if (interaction.customId === "cancelar_ticket") {
        if (interaction.user.id !== ownerId && !isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ Apenas quem abriu ou a staff pode cancelar.",
            ephemeral: true,
          });
        }

        await sendCommandLog(
          interaction.guild,
          interaction.user,
          "cancelar_ticket",
          `Canal: #${channel.name}`
        );

        await archiveTicket(channel, interaction.guild, "Ticket cancelado");

        return interaction.reply({
          content: "📁 Ticket cancelado e arquivado.",
          ephemeral: true,
        });
      }

      if (interaction.customId === "fechar_ticket") {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: "❌ Apenas STAFF ou CEO podem fechar tickets.",
            ephemeral: true,
          });
        }

        await sendCommandLog(
          interaction.guild,
          interaction.user,
          "fechar_ticket",
          `Canal: #${channel.name}`
        );

        await archiveTicket(channel, interaction.guild, "Ticket fechado");

        return interaction.reply({
          content: "📁 Ticket fechado e arquivado.",
          ephemeral: true,
        });
      }

      if (interaction.customId === "chamar_suporte") {
        aiDisabledChannels.add(channel.id);

        await sendCommandLog(
          interaction.guild,
          interaction.user,
          "chamar_suporte",
          `Canal: #${channel.name}`
        );

        await channel.send(`<@&${SUPPORT_ROLE}> suporte solicitado.`);

        return interaction.reply({
          content: "📣 A equipe foi chamada. A IA não responderá mais neste ticket.",
          ephemeral: true,
        });
      }
    }

    /* ---------- COMANDOS /add /remove /manutencao ---------- */
    if (interaction.isChatInputCommand()) {
      if (!isStaff(interaction.member)) {
        return interaction.reply({
          content: "❌ Apenas STAFF ou CEO podem usar este comando.",
          ephemeral: true,
        });
      }

      if (interaction.commandName === "add") {
        if (!isTicketChannel(interaction.channel)) {
          return interaction.reply({
            content: "❌ Esse comando só pode ser usado em tickets.",
            ephemeral: true,
          });
        }

        const user = interaction.options.getUser("user");

        await interaction.channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });

        await sendCommandLog(
          interaction.guild,
          interaction.user,
          "/add",
          `Adicionado: ${user.username} | Canal: #${interaction.channel.name}`
        );

        return interaction.reply({
          content: `✅ ${user} foi adicionado ao ticket.`,
        });
      }

      if (interaction.commandName === "remove") {
        if (!isTicketChannel(interaction.channel)) {
          return interaction.reply({
            content: "❌ Esse comando só pode ser usado em tickets.",
            ephemeral: true,
          });
        }

        const user = interaction.options.getUser("user");
        const ownerId = getTicketOwnerId(interaction.channel);

        if (user.id === ownerId) {
          return interaction.reply({
            content: "❌ Você não pode remover o dono do ticket.",
            ephemeral: true,
          });
        }

        await interaction.channel.permissionOverwrites.delete(user.id);

        await sendCommandLog(
          interaction.guild,
          interaction.user,
          "/remove",
          `Removido: ${user.username} | Canal: #${interaction.channel.name}`
        );

        return interaction.reply({
          content: `✅ ${user} foi removido do ticket.`,
        });
      }

      if (interaction.commandName === "manutencao") {
        const modo = interaction.options.getString("modo");
        manutencao = modo === "on";

        await atualizarStatus();

        await sendCommandLog(
          interaction.guild,
          interaction.user,
          "/manutencao",
          `Modo: ${modo}`
        );

        return interaction.reply({
          content: `🔧 Modo manutenção ${manutencao ? "ativado" : "desativado"}.`,
          ephemeral: true,
        });
      }
    }
  } catch (error) {
    console.log("Erro interactionCreate:", error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Ocorreu um erro ao processar essa ação.",
        ephemeral: true,
      });
    }
  }
});

client.on("messageCreate", async (message) => {
  try {
    await handleAiResponse(message);
  } catch (error) {
    console.log("Erro IA ticket:", error);
  }
});

client.login(process.env.TOKEN);