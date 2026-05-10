import telebot
from telebot import types

BOT_TOKEN = "8078620109:AAEb6lKiLQTZ2K2YQJS8y-CYrizbbCsmesg"
bot = telebot.TeleBot(BOT_TOKEN)

# comando /start
@bot.message_handler(commands=["start"])
def start(message):
    markup = types.InlineKeyboardMarkup(row_width=2)
    b1 = types.InlineKeyboardButton("Admin", callback_data="admin")
    b2 = types.InlineKeyboardButton("Jogo", callback_data="jogo")
    markup.add(b1, b2)
    bot.reply_to(message, "Bot de grupo funcionando. Escolha uma opcao:", reply_markup=markup)

# painel admin (aqui so mostra mensagem, sem nada pesado)
@bot.callback_query_handler(func=lambda c: c.data == "admin")
def painel_admin(call):
    bot.answer_callback_query(call.id, "Painel admin")
    bot.send_message(call.message.chat.id, "Painel admin simples ativo.")

# painel jogo (so menu basico)
@bot.callback_query_handler(func=lambda c: c.data == "jogo")
def painel_jogo(call):
    m = types.InlineKeyboardMarkup(row_width=3)
    a = types.InlineKeyboardButton("Ataque", callback_data="atk")
    d = types.InlineKeyboardButton("Defesa", callback_data="def")
    ct = types.InlineKeyboardButton("Contra", callback_data="ctr")
    m.add(a, d, ct)
    bot.edit_message_text("Escolha sua posicao no jogo:", call.message.chat.id, call.message.message_id, reply_markup=m)

@bot.callback_query_handler(func=lambda c: c.data in ["atk", "def", "ctr"])
def escolha_pos(call):
    if c.data == "atk":
        pos = "ATAQUE"
    elif c.data == "def":
        pos = "DEFESA"
    else:
        pos = "CONTRA ATAQUE"
    bot.answer_callback_query(call.id, "Voce escolheu " + pos)
    bot.send_message(call.message.chat.id, "Jogador " + call.from_user.first_name + " entrou em " + pos)

if __name__ == "__main__":
    print("Bot simples de grupo iniciado...")
    bot.infinity_polling()
