// The card type's current unit price is the only source of package pricing.
// Explicit bonus cards remain free; legacy saved offer prices are ignored.
export function luckyPackagePricing(unitPrice: number, cardCount: number, bonusCards = 0) {
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isInteger(cardCount) || cardCount < 1 ||
      !Number.isInteger(bonusCards) || bonusCards < 0 || !Number.isSafeInteger(cardCount + bonusCards)) {
    throw new Error("Invalid lucky card price or package quantity");
  }
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const totalCards = cardCount + bonusCards;
  const price = round(unitPrice * cardCount);
  const regular = round(unitPrice * totalCards);
  if (!Number.isFinite(price) || !Number.isFinite(regular)) throw new Error("Invalid lucky package total");
  return {
    totalCards, price, regularPrice: regular > price ? regular : 0,
    perCard: round(price / totalCards),
    perCardRegular: regular > price ? unitPrice : 0,
    discountPercent: regular > price ? Math.round((regular - price) / regular * 100) : 0,
  };
}
