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
SlashCommandBuilder
} = require("discord.js")

const transcripts = require("discord-html-transcripts")
const mc = require("minecraft-server-util")

require("dotenv").config()

const client = new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
})

const STAFF_ROLE="1463732923399143425"
const CEO_ROLE="1475900068744794327"
const SUPPORT_ROLE=process.env.SUPPORT_ROLE

let manutencao=false
let statusMessage=null
let ultimaAtualizacao=Date.now()

const cooldown=new Map()

function tempoRelativo(){

const segundos=Math.floor((Date.now()-ultimaAtualizacao)/1000)

if(segundos<60)return"Atualizado agora"

const minutos=Math.floor(segundos/60)

if(minutos===1)return"Atualizado há 1 minuto"

return`Atualizado há ${minutos} minutos`

}

function painelEmbed(){

return new EmbedBuilder()

.setTitle("🌳 Solstice • Central de Atendimento")

.setDescription(`

Selecione abaixo o tipo de atendimento.

🛠 Suporte técnico  
📜 História / Lore  
💰 Apoio ao servidor  
🎤 Entrevista  

⚠ Abra ticket apenas se necessário.

`)

.setColor(0x8b5cf6)

.setImage(process.env.TICKET_IMAGE_URL)

}

function painelMenu(){

return new ActionRowBuilder().addComponents(

new StringSelectMenuBuilder()

.setCustomId("ticket_menu")

.setPlaceholder("Selecione o atendimento")

.addOptions(

{label:"Suporte Técnico",value:"suporte",emoji:"🛠️"},
{label:"História / Lore",value:"historia",emoji:"📜"},
{label:"Apoio ao Servidor",value:"doacao",emoji:"💰"},
{label:"Entrevista",value:"entrevista",emoji:"🎤"}

)

)

}

function botoesTicket(){

return new ActionRowBuilder().addComponents(

new ButtonBuilder()
.setCustomId("assumir")
.setLabel("Assumir")
.setStyle(ButtonStyle.Primary),

new ButtonBuilder()
.setCustomId("resolver")
.setLabel("Ticket Resolvido")
.setStyle(ButtonStyle.Success),

new ButtonBuilder()
.setCustomId("cancelar")
.setLabel("Cancelar Ticket")
.setStyle(ButtonStyle.Secondary),

new ButtonBuilder()
.setCustomId("fechar")
.setLabel("Fechar")
.setStyle(ButtonStyle.Danger)

)

}

async function garantirPainel(){

const guild=await client.guilds.fetch(process.env.GUILD_ID)
const channel=await guild.channels.fetch(process.env.PANEL_CHANNEL_ID)

const msgs=await channel.messages.fetch({limit:20})

const existe=msgs.find(m=>m.author.id===client.user.id)

if(existe)return

await channel.send({

embeds:[painelEmbed()],
components:[painelMenu()]

})

}

async function criarTicket(interaction,tipo){

const existente=interaction.guild.channels.cache.find(c=>
c.topic && c.topic.includes(`owner:${interaction.user.id}`)
)

if(existente){

return interaction.reply({
content:`Você já possui um ticket aberto: ${existente}`,
ephemeral:true
})

}

const nome=interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g,"")

const canal=await interaction.guild.channels.create({

name:`ticket-${nome}`,

type:ChannelType.GuildText,

parent:process.env.TICKET_CATEGORY_ID,

topic:`owner:${interaction.user.id}`,

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
}

]

})

const embed=new EmbedBuilder()

.setTitle(`🎫 Ticket • ${tipo}`)

.setDescription(`Olá ${interaction.user}

Explique seu problema abaixo.`)

.setColor(0x8b5cf6)

.setImage(process.env.TICKET_IMAGE_URL)

const aiBotao=new ActionRowBuilder().addComponents(

new ButtonBuilder()
.setCustomId("chamar_staff")
.setLabel("Chamar Suporte")
.setStyle(ButtonStyle.Secondary)

)

await canal.send({

content:`<@&${STAFF_ROLE}>`,

embeds:[embed],

components:[botoesTicket(),aiBotao]

})

interaction.reply({
content:`Ticket criado: ${canal}`,
ephemeral:true
})

}

async function atualizarStatus(){

ultimaAtualizacao=Date.now()

try{

const guild=await client.guilds.fetch(process.env.GUILD_ID)
const channel=await guild.channels.fetch(process.env.STATUS_CHANNEL_ID)

let status="🔴 Offline"
let online=0
let max=0
let lista="Nenhum jogador online."

try{

const res=await mc.status(
process.env.MC_SERVER_IP,
parseInt(process.env.MC_SERVER_PORT)
)

status="🟢 Online"
online=res.players.online
max=res.players.max

if(res.players.sample && res.players.sample.length>0){

lista=res.players.sample.map(p=>`• ${p.name}`).join("\n")

}

}catch{}

const embed=new EmbedBuilder()

.setTitle("🌳 Solstice • Status do Servidor")

.setColor(status==="🟢 Online"?0x3ba55d:0xed4245)

.addFields(

{name:"Status",value:`\`\`\`${status}\`\`\``,inline:true},
{name:"Jogadores",value:`\`\`\`${online}/${max}\`\`\``,inline:true},
{name:"IP",value:`\`\`\`${process.env.MC_SERVER_IP}\`\`\``},
{name:"Jogadores Online",value:lista}

)

.setImage(process.env.STATUS_IMAGE_URL)

.setFooter({text:`🔄 ${tempoRelativo()}`})

if(!statusMessage){

const msgs=await channel.messages.fetch({limit:10})

statusMessage=msgs.find(m=>m.author.id===client.user.id)

if(!statusMessage){

statusMessage=await channel.send({embeds:[embed]})

}

}else{

await statusMessage.edit({embeds:[embed]})

}

}catch(err){

console.log("Erro status:",err)

}

}

client.once("ready",async()=>{

console.log(`Bot online como ${client.user.tag}`)

await garantirPainel()

await atualizarStatus()

setInterval(atualizarStatus,60000)

})

client.on("interactionCreate",async interaction=>{

if(interaction.isStringSelectMenu() && interaction.customId==="ticket_menu"){

criarTicket(interaction,interaction.values[0])

}

if(interaction.isButton()){

const canal=interaction.channel
const owner=canal.topic.replace("owner:","")

if(interaction.customId==="cancelar"){

if(interaction.user.id!==owner){

return interaction.reply({
content:"Apenas quem abriu pode cancelar.",
ephemeral:true
})

}

await canal.delete()

}

if(interaction.customId==="resolver"){

await canal.send("✅ Ticket marcado como resolvido.")

}

if(interaction.customId==="fechar"){

if(!interaction.member.roles.cache.has(STAFF_ROLE))return

const file=await transcripts.createTranscript(canal)

const log=interaction.guild.channels.cache.get(process.env.LOG_CHANNEL_ID)

await log.send({
content:`Ticket fechado ${canal.name}`,
files:[file]
})

await canal.setParent(process.env.ARCHIVE_CATEGORY_ID)

}

if(interaction.customId==="chamar_staff"){

await canal.send(`<@&${SUPPORT_ROLE}> suporte solicitado.`)

}

}

})

client.on("messageCreate",async message=>{

if(message.author.bot)return

if(message.channel.parentId!==process.env.TICKET_CATEGORY_ID)return

const respostas={

"ip":"Nosso IP é solsticesmp.jogar.io",
"discord":"Todas informações estão no Discord.",
"loja":"Atualmente não temos loja ativa."

}

const msg=message.content.toLowerCase()

for(const pergunta in respostas){

if(msg.includes(pergunta)){

return message.reply(respostas[pergunta])

}

}

})

client.on("messageCreate",async message=>{

if(message.author.bot)return

if(!message.content.startsWith("/"))return

const canal=await message.guild.channels.fetch(process.env.COMMAND_LOG_CHANNEL_ID)

if(!canal)return

const embed=new EmbedBuilder()

.setTitle("Log de comando")

.addFields(

{name:"Nick",value:message.author.username},
{name:"Comando",value:message.content}

)

.setColor(0xffcc00)

.setTimestamp()

canal.send({embeds:[embed]})

})

client.login(process.env.TOKEN)