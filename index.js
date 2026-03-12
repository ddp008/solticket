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
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

const STAFF_ROLE = "1463732923399143425";
const CEO_ROLE = "1475900068744794327";

const tipos = {
  suporte: { nome: "Suporte / Dúvidas", emoji: "🛠️", prefixo: "suporte" },
  historia: { nome: "História", emoji: "📜", prefixo: "historia" },
  doacao: { nome: "Doação / Requisito", emoji: "💰", prefixo: "doacao" },
};

const cooldown = new Map();

function criarEmbedPainel() {
  return new EmbedBuilder()
    .setTitle("🌳 Solstice • Central de Tickets")
    .setDescription(`
Precisa de ajuda? Abra um ticket e nossa equipe irá te atender.

**Utilize o ticket para:**

• 🛠️ Suporte geral  
• 📜 Questões de história  
• 💰 Doações
`)
    .setColor(0x8b5cf6)
    .setImage(process.env.TICKET_IMAGE_URL)
    .setFooter({ text: "Solstice SMP © Todos os direitos reservados" });
}

function criarMenuPainel() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_menu")
    .setPlaceholder("Selecione a categoria do ticket")
    .addOptions(
      {
        label: "Suporte / Dúvidas",
        value: "suporte",
        emoji: "🛠️",
        description: "Problemas técnicos ou ajuda geral",
      },
      {
        label: "História",
        value: "historia",
        emoji: "📜",
        description: "Questões sobre lore ou narrativa",
      },
      {
        label: "Doação / Requisito",
        value: "doacao",
        emoji: "💰",
        description: "Benefícios, apoio ou requisitos",
      }
    );

  return new ActionRowBuilder().addComponents(menu);
}

async function garantirPainel() {
  try {
    console.log("Iniciando verificação do painel...");

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    if (!guild) {
      console.log("Guild não encontrada.");
      return;
    }

    const channel = await guild.channels.fetch(process.env.PANEL_CHANNEL_ID);
    if (!channel) {
      console.log("Canal do painel não encontrado.");
      return;
    }

    if (!channel.isTextBased()) {
      console.log("O canal do painel não é de texto.");
      return;
    }

    const mensagens = await channel.messages.fetch({ limit: 20 });

    const painelExistente = mensagens.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title &&
        msg.embeds[0].title.includes("Central de Tickets")
    );

    if (painelExistente) {
      console.log("Painel já existe no canal.");
      return;
    }

    await channel.send({
      embeds: [criarEmbedPainel()],
      components: [criarMenuPainel()],
    });

    console.log("Painel enviado com sucesso.");
  } catch (error) {
    console.log("Erro ao garantir painel:");
    console.log(error);
  }
}

client.once("ready", async () => {
  console.log(`SolTicket online como ${client.user.tag}`);
  await garantirPainel();
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
      const tipo = interaction.values[0];
      const userId = interaction.user.id;

      const tempoRestante = cooldown.get(userId) - Date.now();
      if (tempoRestante > 0) {
        return interaction.reply({
          content: `⏳ Aguarde ${Math.ceil(tempoRestante / 1000)} segundos para abrir outro ticket.`,
          ephemeral: true,
        });
      }

      const existente = interaction.guild.channels.cache.find(
        (c) => c.topic && c.topic.includes(`TICKET_OWNER:${interaction.user.id}`)
      );

      if (existente) {
        return interaction.reply({
          content: `Você já possui um ticket aberto: ${existente}`,
          ephemeral: true,
        });
      }

      cooldown.set(userId, Date.now() + 60000);

      const nomeUsuario = interaction.user.username
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 15);

      const canal = await interaction.guild.channels.create({
        name: `${tipos[tipo].prefixo}-${nomeUsuario}`,
        type: ChannelType.GuildText,
        parent: process.env.TICKET_CATEGORY_ID,
        topic: `TICKET_OWNER:${interaction.user.id}`,
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

      const embedTicket = new EmbedBuilder()
        .setTitle(`🎫 Ticket • ${tipos[tipo].nome}`)
        .setDescription(`
Olá ${interaction.user}!

Explique abaixo com detalhes o que você precisa.

**Categoria:** ${tipos[tipo].nome}
`)
        .setColor(0x8b5cf6)
        .setImage(process.env.TICKET_IMAGE_URL)
        .setFooter({ text: "🌳 Sistema de suporte • Solstice" });

      const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("assumir_ticket")
          .setLabel("Assumir Ticket")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("fechar_ticket")
          .setLabel("Fechar Ticket")
          .setStyle(ButtonStyle.Danger)
      );

      await canal.send({
        content: `<@&${STAFF_ROLE}>`,
        embeds: [embedTicket],
        components: [botoes],
      });

      return interaction.reply({
        content: `Seu ticket foi criado: ${canal}`,
        ephemeral: true,
      });
    }

    if (interaction.isButton() && interaction.customId === "assumir_ticket") {
      return interaction.reply({
        content: `${interaction.user} assumiu este ticket.`,
      });
    }

    if (interaction.isButton() && interaction.customId === "fechar_ticket") {
      const membro = interaction.member;

      if (
        !membro.roles.cache.has(STAFF_ROLE) &&
        !membro.roles.cache.has(CEO_ROLE)
      ) {
        return interaction.reply({
          content: "❌ Apenas STAFF ou CEO podem fechar ticket.",
          ephemeral: true,
        });
      }

      const attachment = await transcripts.createTranscript(interaction.channel, {
        limit: -1,
        filename: `transcript-${interaction.channel.name}.html`,
      });

      const logChannel = interaction.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send({
          content: `📁 Ticket fechado: ${interaction.channel.name}`,
          files: [attachment],
        });
      }

      await interaction.channel.setParent(process.env.ARCHIVE_CATEGORY_ID);

      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.roles.everyone,
        { SendMessages: false }
      );

      await interaction.reply({
        content: "📁 Ticket arquivado e transcript salvo.",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.log(error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ Ocorreu um erro ao processar esta ação.",
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.TOKEN);