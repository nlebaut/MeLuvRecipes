const minutes = (value) => {
  const parts = [...(value ?? "").matchAll(/(\d+)\s*(h|min)/g)];
  return parts.length ? parts.reduce((total, [, amount, unit]) => total + Number(amount) * (unit === "h" ? 60 : 1), 0) : null;
};

export const matchesDuration = (prepTime, cookTime, duration) => {
  if (!["under20", "20to40", "over40"].includes(duration)) return true;
  const prep = minutes(prepTime);
  const cook = cookTime == null || cookTime === "" ? 0 : minutes(cookTime);
  if (prep == null || cook == null) return false;
  const total = prep + cook;
  return duration === "under20" ? total < 20 : duration === "20to40" ? total >= 20 && total <= 40 : total > 40;
};
