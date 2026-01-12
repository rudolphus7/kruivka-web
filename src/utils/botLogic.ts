export const botSpeeches = {
    nomination: (targetName: string) => [
        `Мені не подобається ${targetName}.`,
        `Інтуїція підказує, що ${targetName} — зрадник.`,
        `Пропоную перевірити ${targetName}.`,
        `Увага на ${targetName}.`
    ].sort(() => Math.random() - 0.5)[0],

    defense: () => [
        "Це помилка! Я свій!",
        "Я мирний!",
        "Я Упівець!",
        "Це наклеп!"
    ].sort(() => Math.random() - 0.5)[0],

    general: (role: string) => {
        switch (role) {
            case "sheriff": return ["Я стежу за порядком.", "Маю підозри."].sort(() => Math.random() - 0.5)[0];
            case "mafia":
            case "don": return ["Ми маємо бути єдині.", "Не давайте ворогу нас розсварити."].sort(() => Math.random() - 0.5)[0];
            case "doctor": return ["Головне - життя.", "Бережіть себе."].sort(() => Math.random() - 0.5)[0];
            default: return ["Я хочу перемоги.", "Хтось бреше.", "Голосуймо розумно."].sort(() => Math.random() - 0.5)[0];
        }
    }
};
