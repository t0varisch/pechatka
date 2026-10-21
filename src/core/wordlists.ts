// Частые слова — запас для уроков, если в библиотеке мало текста нужной раскладки.

export const RU_WORDS = `и в не на я быть он с что а по это она этот к но они мы как из у который то за свой
весь год от так о для ты же все тот мочь вы человек такой его сказать только или ещё бы себя один как уже до
время если сам когда другой вот говорить наш мой знать стать при чтобы дело жизнь кто первый очень два день её
новый рука даже во со раз где там под можно ну какой после их работа без самый потом надо хотеть ли слово идти
большой должен место иметь ничто то сейчас тут лицо каждый друг нет теперь ни глаз тоже тогда видеть вопрос
через да здесь дом да потому сторона какой-то думать сделать страна жить чем мир об последний случай голова
более делать что-то смотреть ребёнок просто конечно сила российский конец перед несколько вид система всегда
работать между три нет понять пойти часть спросить город дать также никто понимать получить отношение лишь
второй именно голос узнать ход тысяча общий мысль история главный решение машина ответ свет ночь путь правда
дорога земля женщина деньги стол образ книга вода окно утро вечер сердце дверь улица небо мать отец сын брат
школа язык точно быстро медленно хорошо плохо легко трудно сегодня завтра вчера всегда никогда почему зачем
читать писать печатать слушать помнить любить ждать искать найти начать кончить сидеть стоять лежать бежать
жёлтый щека шёпот подъезд объём съесть щедрый жужжать чащоба цифра фраза эхо юмор яблоко ёлка хвост шум`
	.split(/\s+/)
	.filter(Boolean);

export const EN_WORDS = `the be to of and a in that have i it for not on with he as you do at this but his by
from they we say her she or an will my one all would there their what so up out if about who get which go me
when make can like time no just him know take people into year your good some could them see other than then
now look only come its over think also back after use two how our work first well way even new want because
any these give day most us is was are been has had were said did made found long down side been number word
water call write part sound place little very after thing our just name great where help through much before
line right too mean old same tell boy follow came want show also around form three small set put end does
another well large must big even such turn here why ask went men read need land different home move try kind
hand picture again change off play spell air away animal house point page letter mother answer study still
learn should world high every near add food between own below country plant last school father keep tree never
start city earth eye light thought head under story saw left few while along might close something seem next
hard open example begin life always those both paper together got group often run important until children
feet car mile night walk white sea began grow took river four carry state once book hear stop without second
later miss idea enough eat face watch far really almost let above girl sometimes mountain cut young talk soon
list song being leave family quick brown fox jumps over lazy dog quiet zone jazz quiz box exact puzzle`
	.split(/\s+/)
	.filter(Boolean);
