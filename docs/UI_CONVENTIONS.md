# UI conventions

The reader is one man, once a month, on a laptop, usually checking a figure
against a bank slip. Every rule here follows from that, and most of them were
arrived at by getting it wrong first.

## Tokens

`app/_styles/globals.css`. Named by role, never by hue, so setting the app up
for a different committee is a token swap and nothing in the markup says
"green" when the new one wants blue.

Base font size is 17px, a notch up from a website's. There is no dark mode: the
app is used in an office, and a second palette is surface area with no reader
asking for it.

## Colour has exactly two jobs

`--color-in` (green) is money arriving in the committee account.
`--color-out` (amber) is money leaving it, or owed back to it.

That is the whole system. When a palette grows a hue per *kind of thing* rather
than per *meaning*, it reads as a rainbow and stops carrying anything the label
did not already say. `--color-danger` is reserved for a refusal or a figure
below zero, and is never a fourth category.

**Colour is never the only cue.** Money in and money out are green and amber
*and* have opposite arrows. A status is a colour *and* a word. The current nav
item has a background, an `aria-current`, and a bar the eye can find. This is
not only for colourblind readers — it is for a cheap screen in bad light, which
is where these apps get used.

A negative stake gets the amber `out` treatment, an arrow, and a screen-reader
note, because a minus sign on its own is thin for something that important.

## Numbers

**A figure never wraps, truncates or clips.** "Rs 2,500,000" breaking after the
"Rs" reads for a moment as two figures. Hold it on one line and let the
*layout* give way — `.stat-value` is `whitespace-nowrap` and the stat grids
drop from four columns to two rather than folding a number.

`.td-num` for any column of figures: right-aligned, `whitespace-nowrap`,
tabular numerals. Money in prose does not get that for free — use `<Money>`,
which carries `.num` itself.

**Fix the decimals across a column.** `money()` shows paisa only when there are
some, which is right in a sentence and wrong in a column; pass `paisa` on an
installment column so it does not read 8,266.67 / 4,000 / 124,000 in three
different shapes. Do not pass it in prose — that is what printed
"Rs 14,500.00" for a figure with no paisa.

**The data is bigger than the chrome.** A figure someone verifies is never
smaller than the label describing it. Getting that backwards is the most common
readability failure there is.

## Tables

Every table sits in `.table-wrap`, which scrolls **inside its own box**. The
page body never scrolls sideways — that is how a column ends up hidden under a
pinned one.

`.table-wrap` is also `relative`, and that is load-bearing rather than
decoration. See the changelog entry on `sr-only`: an absolutely positioned
descendant is only clipped when its containing block is inside the scroller,
and without `relative` the containing block is the viewport.

Anything that keeps growing gets a pager, with the page number in the query
string so Back walks through it. **A dead pager control is a `<span>`, not a
link styled to look disabled** — a disabled-looking link still takes focus and
still navigates.

The projection table has no pager on purpose: its length is set by an explicit
"look ahead" control, so it is bounded rather than growing.

## Forms: dialog or the page?

The test is how often the job is done, not how big the form is.

- **Every month** — marking ten contributions, giving out the committee. The
  control is right there in the row, or the form is a card on the page.
- **Set up once** — adding a member, adding a login. One button that opens a
  dialog. A permanent five-field form for the rare job crowds out the daily
  one.

**Destructive actions confirm in a dialog, never inline.** An inline "are you
sure?" replaces a small button with a three-line block, the row grows, and
every row below it jumps down the page — so the row you were aiming at moves
while you are reading the question.

Three things every dialog in this repo does, each learned the hard way:

- **No click-outside-to-close** on anything holding a form. A click fires on
  the nearest common ancestor of mousedown and mouseup, so selecting text in a
  field and releasing a few pixels past the panel edge is indistinguishable
  from a backdrop click.
- **A refusal keeps it open.** Most of what this app does can be turned down by
  the database, and the sentence explaining why is the only part of the
  interaction that matters. `useEffect` closes on `state.ok`, never on submit.
- **Typography is reset on the panel.** `<dialog>` paints in the top layer so
  its DOM position does not constrain its layout, but inherited properties
  still come down the tree — and a confirm dialog usually renders inside the
  right-aligned, `whitespace-nowrap` cell whose button opened it.

## The refusal is the most important message the app produces

A failed action returns `{ ok: false, message }` and the message is the
database's own sentence, passed through untouched. The triggers in
`db/migrations/` are written as sentences aimed at Arshad, naming the person
and the figures, precisely so they can be shown as-is. `describeError()` only
maps the handful that surface as raw constraint names, which have no voice of
their own.

**Success leaves as a message that clears; failure stays where it happened.** A
success message left in a form is still there over the next entry, describing
something no longer on screen.

## Filters live in the URL

The projection screen's controls are a plain GET form, so every scenario is a
URL: Back walks through the ones already tried, and one can be reloaded or
written down. The currently-selected filter is a `<span>` with `aria-current`,
never a link to the page you are already on.

## Pending states

Every control that waits says so — `SubmitButton` swaps its label for a spinner
and a pending word, and disables. A round trip with no feedback looks frozen,
and the natural response is to press it again, which queues a second write.

## Container queries, not breakpoints

Once there is a 16rem sidebar, viewport width and content width are different
numbers: a 1024px window gives the content about 768px, so `xl:grid-cols-4`
fires while each card is still too narrow for its own figure. The stat grids
use `@container` and `@[34rem]` / `@[64rem]`, which describe the space the
component actually has.

## Print

`app/print/` is a real screen, not a stylesheet. Nine of the ten members never
open the app and cannot — it answers only on this laptop — so a printed or
PDF'd sheet is the whole sharing mechanism.

Statements read oldest-first like a passbook; screens read newest-first.
Overrides are reprinted in full on the month summary, inside a red box, with
the reason quoted. That is the entire point of writing one down.

## Icons

One module, `app/_components/ui/Icon.js`, mapping a name to a path. Call sites
write `<Icon name="cash-in" />`, so swapping the set is one file. Drawn by hand
rather than pulled from a package: the app has to work with no internet and no
font CDN, and a handful of paths is smaller than a dependency.

Every icon is `aria-hidden` and sits beside its own label, so a screen reader
is not made to announce the same thing twice. The exception is an icon-only
button, which carries its label in `aria-label` and `title`.
