const { occurrence } = require('./plans');
// Split the entered total into monthly card charges, preserving every cent.
function installmentSchedule(amount, date, count) {
  const cents = Math.round(amount * 100);
  const monthly = Math.floor(cents / count);
  return Array.from({ length: count }, (_, i) => {
    return {
      date: occurrence(date, 'monthly', i),
      amount: (i === count - 1 ? cents - monthly * (count - 1) : monthly) / 100
    };
  });
}

module.exports = { installmentSchedule };
