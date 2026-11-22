# Pocket Accountant

Искам да създам приложение (аи асистент) които взима извлечения от различни приложения за разплащане (Револют, дск...) и категоризира доходи и разходи и визуализира всичко за да е ясно за обикновените хора без финансово образование. Искам автоматично извличане и обработка на данни.  Идеята му е да е личен счетоводител, който визуализира ясно къде си харчиш парите и за какво и колко.  Идеята е да включва аи асистент, който да питаш колко пари похарчих за храна/дрехи/транспорт... и той да ти връща ясен отговор на база на събраната информация.   В случай че не е възможно аи да се свърже автоматично директно с приложенията на банките, (поради конфиденциална информация или др) и да извлича информацията за транзакциите има два подхода за които се сещам.  Подход 1 е през gmail - настройваш си от банката всеки месец да получаваш пдф извлечение и нашето приложение взима тези пдф-и и обработва от там информацията. Подход 2 open banking AISP aggregators - API platforms. Кой вариант бил най-подходящ и реализуем за най-ефективно събиране на цялата информация която след това да обработи и визуализира? Какви пропуски имаме? Има ли други по-добри варианти за достъп до информацията за които не сме се сетили?

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/24b38573-cd72-4ec4-a5b4-e7968c421ef3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
