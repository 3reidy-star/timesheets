"use client";

import { useEffect } from "react";

const translations: Array<[string, string]> = [
  ["Employee requested to finish early", "Сотрудник попросил закончить раньше"],
  ["Tick if stayed away from home (adds £35)", "Отметьте, если ночевали вне дома (добавляется £35)"],
  ["Use Edit if you need to correct anything before submission.", "Нажмите «Изменить», если перед отправкой нужно что-либо исправить."],
  ["This looks like an early finish", "Похоже, работа закончена раньше"],
  ["Overnight stay allowance (£35)", "Доплата за ночёвку (£35)"],
  ["Job / Site (free text)", "Объект / место работы (свободный текст)"],
  ["Finish must be after start", "Время окончания должно быть позже времени начала"],
  ["Go back and add an entry first.", "Вернитесь назад и сначала добавьте запись."],
  ["This action cannot be undone.", "Это действие нельзя отменить."],
  ["Delete this timesheet entry for", "Удалить эту запись табеля за"],
  ["Half day allocation", "Выбор половины дня"],
  ["Overnight allowance", "Доплата за ночёвку"],
  ["Agreed rate (optional)", "Согласованная ставка (необязательно)"],
  ["Notes (optional)", "Примечания (необязательно)"],
  ["Entries (detailed)", "Записи (подробно)"],
  ["Week starting (Mon)", "Неделя с понедельника"],
  ["No business top-up", "Без доплаты компании"],
  ["Business top-up", "Доплата компании"],
  ["Failed to create entry", "Не удалось создать запись"],
  ["Failed to update entry", "Не удалось обновить запись"],
  ["Failed to delete entry", "Не удалось удалить запись"],
  ["Failed to submit week", "Не удалось отправить неделю"],
  ["Failed to load entry", "Не удалось загрузить запись"],
  ["Failed to load week", "Не удалось загрузить неделю"],
  ["Invalid start time", "Неверное время начала"],
  ["Invalid finish time", "Неверное время окончания"],
  ["Date is required", "Укажите дату"],
  ["Invalid date", "Неверная дата"],
  ["Confirm & save", "Подтвердить и сохранить"],
  ["Save changes", "Сохранить изменения"],
  ["Save entry", "Сохранить запись"],
  ["Submit week", "Отправить неделю"],
  ["Submitting…", "Отправка…"],
  ["Saving…", "Сохранение…"],
  ["Deleting…", "Удаление…"],
  ["Loading…", "Загрузка…"],
  ["Weekly timesheet", "Недельный табель"],
  ["My Timesheet", "Мой табель"],
  ["Confirm entry", "Подтверждение записи"],
  ["Edit entry", "Изменить запись"],
  ["Add entry", "Добавить запись"],
  ["Entry not found.", "Запись не найдена."],
  ["No draft found", "Черновик не найден"],
  ["No entries yet.", "Записей пока нет."],
  ["No entries.", "Нет записей."],
  ["No week loaded.", "Неделя не загружена."],
  ["Week locked", "Неделя заблокирована"],
  ["Entry type", "Тип записи"],
  ["Start Time", "Время начала"],
  ["Finish Time", "Время окончания"],
  ["Job/Site:", "Объект:"],
  ["Time:", "Время:"],
  ["Notes:", "Примечания:"],
  ["Calculated", "Рассчитано"],
  ["Core Paid", "Основное оплачиваемое время"],
  ["Regular", "Обычные часы"],
  ["Overtime", "Сверхурочные"],
  ["Total", "Итого"],
  ["Date", "Дата"],
  ["Previous week", "Предыдущая неделя"],
  ["Next week", "Следующая неделя"],
  ["Current week", "Текущая неделя"],
  ["Submitted", "Отправлено"],
  ["Approved", "Одобрено"],
  ["Rejected", "Отклонено"],
  ["Draft", "Черновик"],
  ["Holiday", "Отпуск"],
  ["Sick", "Больничный"],
  ["Training", "Обучение"],
  ["Work", "Работа"],
  ["Full day", "Полный день"],
  ["Half day", "Половина дня"],
  ["Job & Knock", "Работа до выполнения"],
  ["Yes", "Да"],
  ["No", "Нет"],
  ["Edit", "Изменить"],
  ["Delete", "Удалить"],
  ["Back", "Назад"],
  ["Cancel", "Отмена"],
  ["Monday", "Понедельник"],
  ["Tuesday", "Вторник"],
  ["Wednesday", "Среда"],
  ["Thursday", "Четверг"],
  ["Friday", "Пятница"],
  ["Saturday", "Суббота"],
  ["Sunday", "Воскресенье"],
  ["e.g. Client / Site ref", "например, клиент / объект"],
  ["Any notes for accounts…", "Примечания для бухгалтерии…"],
];

function translate(value: string) {
  let result = value;
  for (const [english, russian] of translations) {
    result = result.replaceAll(english, russian);
    result = result.replaceAll(english.toUpperCase(), russian.toUpperCase());
  }
  return result;
}

function translateElement(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const parent = node.parentElement;
    if (parent && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
      const current = node.nodeValue ?? "";
      const translated = translate(current);
      if (translated !== current) node.nodeValue = translated;
    }
    node = walker.nextNode();
  }

  root.querySelectorAll<HTMLElement>("[placeholder], [title], [aria-label]").forEach((element) => {
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      const current = element.getAttribute(attribute);
      if (current) element.setAttribute(attribute, translate(current));
    }
  });
}

export default function EngineerRussian({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    document.documentElement.lang = "ru";
    translateElement(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target.parentNode) {
          translateElement(mutation.target.parentNode);
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) translateElement(node as Element);
          if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
            translateElement(node.parentNode);
          }
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [enabled]);

  return null;
}
