// Cairn — seed data for the prototype.
// Three users (Alice = me, Bob, Carol). Five lists. Believable items.

const SEED_USERS = {
  alice: {
    id: "alice",
    display_name: "Alice",
    initial: "A",
    tone: "oklch(72% 0.10 50)",
  },
  bob: {
    id: "bob",
    display_name: "Bob",
    initial: "B",
    tone: "oklch(70% 0.10 220)",
  },
  carol: {
    id: "carol",
    display_name: "Carol",
    initial: "C",
    tone: "oklch(70% 0.10 330)",
  },
  // Tombstone user — every deleted account anonymizes to this one row.
  // Mirrors the sentinel UUID in production (see account-deletion.md).
  ghost: {
    id: "ghost",
    display_name: "Deleted user",
    initial: "",
    tone: "oklch(78% 0.01 80)",
    tombstone: true,
  },
};

// Each list: id, name, description, members[], modified_at (display string)
const SEED_LISTS = [
  {
    id: "l1",
    icon: "film",
    name: "Movies for Bob",
    description:
      "Old black-and-white films I keep telling Bob to watch and they keep not watching.",
    members: ["alice", "bob"],
    modified_at: "2 hours ago",
    items: [
      {
        id: "i1",
        name: "Casablanca",
        notes: "The one Bob has been pretending to have seen for two years.",
        created_by: "alice",
        created_at: "1 May 2026",
        votes: { alice: 3, bob: 1 },
      },
      {
        id: "i2",
        name: "The Third Man",
        notes: "Vienna. Zithers. Orson Welles in a doorway. Trust me.",
        created_by: "alice",
        created_at: "1 May 2026",
        votes: { alice: 3, bob: -1 },
        edited_by: "bob",
        edited_at: "3 May 2026",
      },
      {
        id: "i3",
        name: "Sunset Boulevard",
        notes: "",
        created_by: "bob",
        created_at: "15 Apr 2026",
        votes: { alice: 2, bob: 2 },
      },
      {
        id: "i4",
        name: "Bringing Up Baby",
        notes: "Screwball. Cary Grant. A leopard.",
        created_by: "alice",
        created_at: "12 Apr 2026",
        votes: { alice: 1 },
      },
      {
        id: "i5",
        name: "Double Indemnity",
        notes: "",
        created_by: "alice",
        created_at: "8 Apr 2026",
        votes: { alice: 1, bob: -2 },
      },
      {
        id: "i6",
        name: "M",
        notes: "Fritz Lang. Peter Lorre. Will haunt you.",
        created_by: "alice",
        created_at: "2 Apr 2026",
        votes: { alice: 2, bob: -3 },
      },
    ],
  },
  {
    id: "l2",
    icon: "film",
    name: "Movies for Alice",
    description: "Bob's sci-fi list. Aggressively scored.",
    members: ["alice", "bob"],
    modified_at: "yesterday",
    items: [
      {
        id: "j1",
        name: "Stalker",
        notes: "Tarkovsky. Slow. Worth it.",
        created_by: "bob",
        created_at: "28 Apr 2026",
        votes: { alice: 2, bob: 3 },
      },
      {
        id: "j2",
        name: "Annihilation",
        notes: "",
        created_by: "bob",
        created_at: "20 Apr 2026",
        votes: { alice: 1, bob: 2 },
      },
      {
        id: "j3",
        name: "Primer",
        notes: "You will need a chart.",
        created_by: "bob",
        created_at: "15 Apr 2026",
        votes: { alice: -1, bob: 3 },
      },
    ],
  },
  {
    id: "l3",
    icon: "map-pin",
    name: "Things to do in Amsterdam",
    description:
      "Carol is visiting in June. Things they should not miss, in roughly priority order.",
    members: ["alice", "bob", "carol"],
    modified_at: "3 days ago",
    items: [
      {
        id: "k1",
        name: "Rijksmuseum (Vermeer wing)",
        notes: "Go on a Tuesday morning. Empty.",
        created_by: "alice",
        created_at: "20 Apr 2026",
        votes: { alice: 3, bob: 2, carol: 3 },
      },
      {
        id: "k2",
        name: "Foam (photography)",
        notes: "",
        created_by: "carol",
        created_at: "18 Apr 2026",
        votes: { alice: 2, carol: 2 },
      },
      {
        id: "k3",
        name: "Bike along the Amstel",
        notes: "Rent a bike at the station, head south for an hour.",
        created_by: "alice",
        created_at: "14 Apr 2026",
        votes: { alice: 3, bob: 3, carol: 1 },
      },
      {
        id: "k4",
        name: "Anne Frank House",
        notes: "Book weeks ahead.",
        created_by: "bob",
        created_at: "10 Apr 2026",
        votes: { alice: 2, bob: 1, carol: 3 },
      },
    ],
  },
  {
    id: "l4",
    icon: "book-open",
    name: "Books, eventually",
    description: "",
    members: ["alice"],
    modified_at: "last week",
    items: [
      {
        id: "m1",
        name: "The Peregrine — J.A. Baker",
        notes: "",
        created_by: "alice",
        created_at: "1 Apr 2026",
        votes: { alice: 3 },
      },
      {
        id: "m2",
        name: "A Pattern Language",
        notes: "Reread. Slowly.",
        created_by: "alice",
        created_at: "20 Mar 2026",
        votes: { alice: 2 },
      },
    ],
  },
  {
    id: "l5",
    icon: "gift",
    name: "Gifts for Carol's birthday",
    description:
      "Closed list — birthday is on the 14th. Bob, do not show this to Carol.",
    members: ["alice", "bob"],
    modified_at: "last week",
    items: [
      {
        id: "n1",
        name: "Field notebook (the green one)",
        notes: "",
        created_by: "alice",
        created_at: "25 Apr 2026",
        votes: { alice: 2, bob: 3 },
      },
      {
        id: "n2",
        name: "Enamel mug from the pottery place",
        notes: "",
        created_by: "bob",
        created_at: "22 Apr 2026",
        votes: { alice: 3, bob: 2 },
      },
    ],
  },
];

window.SEED_USERS = SEED_USERS;
window.SEED_LISTS = SEED_LISTS;
