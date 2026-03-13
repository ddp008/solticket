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

const cooldown=new Map()

let statusMessage=null
let ultimaAtualizacao=Date.now()

const tipos={

suporte:{nome:"Suporte Técnico",emoji:"🛠️",prefixo:"suporte"},
historia:{nome:"História / Lore",emoji:"📜",prefixo:"lore"},
doacao:{nome:"Doações",emoji:"💰",prefixo:"doacao"},
entrevista:{nome:"Entrevista",emoji:"🎤",prefixo:"entrevista"}

}

function tempoRelativo(){

const segundos=Math.floor((Date.now()-ultimaAtualizacao)/1000)

if(segundos<60)return"Atualizado agora"

const minutos=Math.floor(segundos/60)

if(minutos===1)return"Atualizado há 1 minuto"

return`Atualizado há ${minutos} minutos`

}

function criarEmbedPainel(){

return new EmbedBuilder()

.setTitle("🌳 Solstice • Central de Suporte")

.setDescription(`

Antes de abrir um ticket leia atentamente.

Abra ticket apenas se realmente precisar da STAFF.

🛠️ Suporte técnico  
Problemas ou bugs.

📜 História  
Dúvidas sobre lore.

💰 Doações  
Problemas com compra.

🎤 Entrevista  
Agendar entrevista.

Tickets indevidos podem ser fechados.

`)

.setColor(0x8b5cf6)

.setImage(process.env.TICKET_IMAGE_URL)

.setFooter({text:"Solstice SMP • Sistema oficial de suporte"})

}

function criarMenuPainel(){

return new ActionRowBuilder().addComponents(

new StringSelectMenuBuilder()

.setCustomId("ticket_menu")

.setPlaceholder("Selecione o tipo de ticket")

.addOptions(

{label:"Suporte Técnico",value:"suporte",emoji:"🛠️",description:"Problemas técnicos"},
{label:"História / Lore",value:"historia",emoji:"📜",description:"Questões de história"},
{label:"Doações",value:"doacao",emoji:"💰",description:"Problemas com benefícios"},
{label:"Entrevista",value:"entrevista",emoji:"🎤",description:"Agendar entrevista"}

)

)

}

async function garantirPainel(){

const guild=await client.guilds.fetch(process.env.GUILD_ID)
const channel=await guild.channels.fetch(process.env.PANEL_CHANNEL_ID)

const msgs=await channel.messages.fetch({limit:20})

const existe=msgs.find(m=>m.author.id===client.user.id)

if(existe)return

await channel.send({

embeds:[criarEmbedPainel()],
components:[criarMenuPainel()]

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

const res=await mc.status(process.env.MC_SERVER_IP,parseInt(process.env.MC_SERVER_PORT))

status="🟢 Online"
online=res.players.online
max=res.players.max

if(res.players.sample&&res.players.sample.length>0){

lista=res.players.sample.map(p=>`• ${p.name}`).join("\n")

}

}catch{}

const embed=new EmbedBuilder()

.setTitle("🌳 Solstice • Status do Servidor")

.setColor(status==="🟢 Online"?0x3ba55d:0xed4245)

.addFields(

{name:"Status",value:`\`\`\`${status}\`\`\``,inline:true},
{name:"Jogadores",value:`\`\`\`${online}/${max}\`\`\``,inline:true},
{name:"Conectar",value:`\`\`\`${process.env.MC_SERVER_IP}\`\`\``},
{name:"Jogadores Online",value:lista.length>1000?lista.slice(0,1000)+"...":lista}

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

console.log("Erro status",err)

}

}

client.once("ready",async()=>{

console.log(`Bot online como ${client.user.tag}`)

await garantirPainel()

await atualizarStatus()

setInterval(atualizarStatus,60000)

})

client.on("interactionCreate",async interaction=>{

if(interaction.isStringSelectMenu()&&interaction.customId==="ticket_menu"){

const tipo=interaction.values[0]

const userId=interaction.user.id

if(cooldown.has(userId)){

return interaction.reply({content:"Aguarde antes de abrir outro ticket.",ephemeral:true})

}

cooldown.set(userId,true)

setTimeout(()=>cooldown.delete(userId),60000)

const existente=interaction.guild.channels.cache.find(c=>c.topic&&c.topic.includes(`TICKET_OWNER:${userId}`))

if(existente){

return interaction.reply({content:`Você já possui ticket: ${existente}`,ephemeral:true})

}

const nome=interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,12)

const canal=await interaction.guild.channels.create({

name:`${tipos[tipo].prefixo}-${nome}`,

type:ChannelType.GuildText,

parent:process.env.TICKET_CATEGORY_ID,

topic:`TICKET_OWNER:${userId}`,

permissionOverwrites:[

{id:interaction.guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},

{id:userId,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]},

{id:STAFF_ROLE,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]},

{id:CEO_ROLE,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages]}

]

})

const embed=new EmbedBuilder()

.setTitle(`🎫 Ticket • ${tipos[tipo].nome}`)

.setDescription(`Olá ${interaction.user}\n\nExplique detalhadamente seu problema.`)

.setColor(0x8b5cf6)

.setImage(process.env.TICKET_IMAGE_URL)

const row=new ActionRowBuilder().addComponents(

new ButtonBuilder().setCustomId("assumir_ticket").setLabel("Assumir").setStyle(ButtonStyle.Primary),

new ButtonBuilder().setCustomId("fechar_ticket").setLabel("Fechar").setStyle(ButtonStyle.Danger)

)

await canal.send({

content:`<@&${STAFF_ROLE}>`,
embeds:[embed],
components:[row]

})

interaction.reply({content:`Ticket criado: ${canal}`,ephemeral:true})

}

if(interaction.isButton()&&interaction.customId==="fechar_ticket"){

const membro=interaction.member

if(!membro.roles.cache.has(STAFF_ROLE)&&!membro.roles.cache.has(CEO_ROLE)){

return interaction.reply({content:"Apenas STAFF ou CEO podem fechar.",ephemeral:true})

}

const attachment=await transcripts.createTranscript(interaction.channel)

const logChannel=interaction.guild.channels.cache.get(process.env.LOG_CHANNEL_ID)

if(logChannel){

await logChannel.send({content:`Ticket fechado ${interaction.channel.name}`,files:[attachment]})

}

await interaction.channel.setParent(process.env.ARCHIVE_CATEGORY_ID)

await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone,{SendMessages:false})

interaction.reply({content:"Ticket arquivado.",ephemeral:true})

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