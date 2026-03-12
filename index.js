const {
Client,
GatewayIntentBits,
PermissionsBitField,
ChannelType,
ActionRowBuilder,
ButtonBuilder,
ButtonStyle,
StringSelectMenuBuilder,
EmbedBuilder
} = require("discord.js");

const transcripts = require("discord-html-transcripts");

require("dotenv").config();

const client = new Client({
intents: [GatewayIntentBits.Guilds]
});

const STAFF_ROLE = "1463732923399143425";
const CEO_ROLE = "1475900068744794327";

const tipos = {
suporte:{nome:"Suporte / Dúvidas",emoji:"🛠️",prefixo:"suporte"},
historia:{nome:"História",emoji:"📜",prefixo:"historia"},
doacao:{nome:"Doação / Requisito",emoji:"💰",prefixo:"doacao"}
};

client.once("clientReady",()=>{
console.log(`SolTicket online como ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {

try{

/* PAINEL */

if(interaction.isChatInputCommand()){

if(interaction.commandName==="ticketsetup"){

const embed = new EmbedBuilder()
.setTitle("🌳 Solstice • Central de Tickets")
.setDescription(`
Precisa de ajuda? Abra um ticket e nossa equipe irá te atender.

**Utilize o ticket para:**

• 🛠️ Suporte geral  
• ❓ Problemas técnicos  
• 📜 Questões de história  
• 💰 Doações
`)
.setColor(0x8b5cf6)
.setImage(process.env.TICKET_IMAGE_URL)
.setFooter({text:"Solstice SMP © Todos os direitos reservados"});

const menu = new StringSelectMenuBuilder()
.setCustomId("ticket_menu")
.setPlaceholder("Selecione a categoria do ticket")
.addOptions(
{label:"Suporte / Dúvidas",value:"suporte",emoji:"🛠️"},
{label:"História",value:"historia",emoji:"📜"},
{label:"Doação / Requisito",value:"doacao",emoji:"💰"}
);

const row = new ActionRowBuilder().addComponents(menu);

interaction.reply({
embeds:[embed],
components:[row]
});

}

}

/* CRIAR TICKET */

if(interaction.isStringSelectMenu()){

if(interaction.customId==="ticket_menu"){

const tipo = interaction.values[0];

const existente = interaction.guild.channels.cache.find(
c => c.topic && c.topic.includes(interaction.user.id)
);

if(existente){

return interaction.reply({
content:`Você já possui um ticket aberto: ${existente}`,
ephemeral:true
});

}

const canal = await interaction.guild.channels.create({

name:`${tipos[tipo].prefixo}-${interaction.user.username}`,

type:ChannelType.GuildText,

parent:process.env.TICKET_CATEGORY_ID,

topic:`TICKET_OWNER:${interaction.user.id}`,

permissionOverwrites:[

{
id:interaction.guild.roles.everyone.id,
deny:[PermissionsBitField.Flags.ViewChannel]
},

{
id:interaction.user.id,
allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]
},

{
id:STAFF_ROLE,
allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]
},

{
id:CEO_ROLE,
allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]
}

]

});

const embedTicket = new EmbedBuilder()
.setTitle(`🎫 Ticket • ${tipos[tipo].nome}`)
.setDescription(`
Olá ${interaction.user}!

Explique abaixo com detalhes o que você precisa.
`)
.setColor(0x8b5cf6)
.setImage(process.env.TICKET_IMAGE_URL);

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
content:`<@&${STAFF_ROLE}>`,
embeds:[embedTicket],
components:[botoes]
});

interaction.reply({
content:`Seu ticket foi criado: ${canal}`,
ephemeral:true
});

}

}

/* BOTÕES */

if(interaction.isButton()){

if(interaction.customId==="assumir_ticket"){

interaction.reply({
content:`${interaction.user} assumiu este ticket.`,
});

}

/* FECHAR TICKET */

if(interaction.customId==="fechar_ticket"){

const membro = interaction.member;

if(
!membro.roles.cache.has(STAFF_ROLE) &&
!membro.roles.cache.has(CEO_ROLE)
){

return interaction.reply({
content:"❌ Apenas STAFF pode fechar ticket.",
ephemeral:true
});

}

/* GERAR TRANSCRIPT */

const attachment = await transcripts.createTranscript(interaction.channel,{
limit:-1,
filename:`transcript-${interaction.channel.name}.html`
});

/* ENVIAR LOG */

const logChannel = interaction.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);

if(logChannel && logChannel.isTextBased()){

await logChannel.send({
content:`📁 Ticket fechado: ${interaction.channel.name}`,
files:[attachment]
});

}

/* ARQUIVAR */

await interaction.channel.setParent(process.env.ARCHIVE_CATEGORY_ID);

await interaction.channel.permissionOverwrites.edit(
interaction.guild.roles.everyone,
{SendMessages:false}
);

interaction.reply({
content:"📁 Ticket arquivado e transcript salvo.",
ephemeral:true
});

}

}

}catch(error){

console.log(error);

}

});

client.login(process.env.TOKEN);