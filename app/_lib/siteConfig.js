/**
 * Who this app is for, as data.
 *
 * Everything here is read from the pages, the printed statements and the window
 * title, so setting the same app up for a different committee is one edit
 * rather than a grep. The committee's own rules -- the contribution, the term,
 * the ceiling -- are NOT here: those live in the database, because the members
 * can vote to change them without a developer.
 */
export const siteConfig = {
  name: "Committee Manager",
  committeeName: "Muhammad Arshad's Committee",
  managerName: "Muhammad Arshad",

  currency: "Rs",
  locale: "en-PK",

  // Printed at the foot of every statement, so a sheet that has been passed
  // around for a week still says where it came from and when.
  printFooter: "Kept in Committee Manager. Figures as at the date printed.",
};
