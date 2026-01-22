export const PHILOSOPHY_QUOTES = [
	{
		text: 'The unexamined life is not worth living.',
		author: 'Socrates'
	},
	{
		text: 'I think, therefore I am.',
		author: 'René Descartes'
	},
	{
		text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
		author: 'Aristotle'
	},
	{
		text: 'To know what is right and not to do it is the greatest cowardice.',
		author: 'Confucius'
	},
	{
		text: 'One cannot step twice in the same river.',
		author: 'Heraclitus'
	},
	{
		text: 'Man is the measure of all things.',
		author: 'Protagoras'
	},
	{
		text: 'To be is to be perceived.',
		author: 'George Berkeley'
	},
	{
		text: 'The mind is furnished with ideas by experience alone.',
		author: 'John Locke'
	},
	{
		text: 'What we call the "self" is nothing other than a constantly changing procession of experiences.',
		author: 'David Hume'
	},
	{
		text: 'Act only according to that maxim whereby you can, at the same time, will that it should become a universal law.',
		author: 'Immanuel Kant'
	},
	{
		text: 'He who has a why to live can bear almost any how.',
		author: 'Friedrich Nietzsche'
	},
	{
		text: "It's not things that disturb us, but our judgments about them.",
		author: 'Epictetus'
	},
	{
		text: 'Luck is what happens when preparation meets opportunity.',
		author: 'Seneca'
	},
	{
		text: 'You have power over your mind - not outside events.',
		author: 'Marcus Aurelius'
	},
	{
		text: 'Whereof one cannot speak, thereof one must be silent.',
		author: 'Ludwig Wittgenstein'
	}
];

export function getRandomQuote() {
	return PHILOSOPHY_QUOTES[Math.floor(Math.random() * PHILOSOPHY_QUOTES.length)];
}
