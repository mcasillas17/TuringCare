import type { CatalogTemplate } from "@turingcare/shared";

export const trainingCatalog: CatalogTemplate[] = [
  {
    key: "basic-manners",
    name: "Basic Manners",
    description: "Foundational behaviors every dog should know",
    skills: [
      {
        key: "basic-manners.sit",
        name: "Sit",
        description: "Dog reliably sits on cue",
        levels: [
          { level: 1, description: "Lures into a sit with food in a quiet room" },
          {
            level: 2,
            description: "Sits on a verbal or hand cue without food lure in a quiet room",
          },
          { level: 3, description: "Sits on cue with one mild distraction present" },
          { level: 4, description: "Sits on cue in busier indoor or backyard settings" },
          { level: 5, description: "Sits on cue across most environments, including outdoors" },
        ],
      },
      {
        key: "basic-manners.down",
        name: "Down",
        description: "Dog lies down on cue and holds the position",
        levels: [
          { level: 1, description: "Goes into a down with a food lure in a quiet room" },
          { level: 2, description: "Downs on cue without a lure in a quiet room" },
          { level: 3, description: "Downs on cue with mild distractions present" },
          { level: 4, description: "Holds the down 30+ seconds in moderately busy settings" },
          { level: 5, description: "Downs and holds on cue across most environments" },
        ],
      },
      {
        key: "basic-manners.stay",
        name: "Stay",
        description: "Dog holds position until released",
        levels: [
          { level: 1, description: "Holds a sit or down for 3-5 seconds, owner next to dog" },
          { level: 2, description: "Holds for 10+ seconds with owner taking one step away" },
          { level: 3, description: "Holds for 30 seconds with owner moving around the room" },
          {
            level: 4,
            description: "Holds with light distractions (door opening, food on counter)",
          },
          { level: 5, description: "Reliable 60+ second stay with significant distractions" },
        ],
      },
      {
        key: "basic-manners.recall",
        name: "Come (recall)",
        description: "Dog returns when called",
        levels: [
          { level: 1, description: "Comes to you from across the room in a quiet space" },
          { level: 2, description: "Comes through one open doorway when called" },
          { level: 3, description: "Comes when called inside the house with mild distractions" },
          {
            level: 4,
            description: "Comes when called in a fenced outdoor area with moderate distractions",
          },
          {
            level: 5,
            description: "Reliable recall in unfenced areas, including with strong distractions",
          },
        ],
      },
      {
        key: "basic-manners.loose-leash",
        name: "Loose-leash walking",
        description: "Dog walks without pulling",
        levels: [
          { level: 1, description: "Walks calmly beside you in the house or driveway" },
          { level: 2, description: "Walks without pulling for short stretches on a quiet street" },
          {
            level: 3,
            description: "Walks without pulling past mild distractions (parked cars, smells)",
          },
          {
            level: 4,
            description:
              "Walks without pulling around moderate distractions (people, distant dogs)",
          },
          {
            level: 5,
            description: "Maintains loose leash on busy walks with significant distractions",
          },
        ],
      },
    ],
  },
  {
    key: "puppy-fundamentals",
    name: "Puppy Fundamentals",
    description: "The first lessons for puppies under 6 months",
    skills: [
      {
        key: "puppy-fundamentals.name-recognition",
        name: "Name recognition",
        description: "Puppy turns head to their name",
        levels: [
          { level: 1, description: "Turns to look when name is said in a quiet room" },
          { level: 2, description: "Turns to look with mild background sounds" },
          { level: 3, description: "Turns and moves toward you when called in the house" },
          { level: 4, description: "Responds to name even when engaged with a toy" },
          { level: 5, description: "Responds to name in distracting outdoor settings" },
        ],
      },
      {
        key: "puppy-fundamentals.potty-signal",
        name: "Potty signal",
        description: "Puppy communicates the need to go outside",
        levels: [
          { level: 1, description: "Goes potty outside when taken on a frequent schedule" },
          { level: 2, description: "Holds it briefly inside between scheduled outings" },
          {
            level: 3,
            description: "Shows a noticeable signal (sniffing, going to door) when needs to go",
          },
          {
            level: 4,
            description: "Consistently uses a signal (bell, door touch) to request to go out",
          },
          {
            level: 5,
            description: "Reliably signals and waits to be taken out, no accidents for a full week",
          },
        ],
      },
      {
        key: "puppy-fundamentals.sit",
        name: "Sit (puppy-paced)",
        description: "Puppy sits on cue",
        levels: [
          { level: 1, description: "Sits with a food lure in a quiet space" },
          { level: 2, description: "Sits on a verbal cue with treats nearby" },
          { level: 3, description: "Sits before meals or when greeted at the door" },
          { level: 4, description: "Sits during short impulse-control practice" },
          {
            level: 5,
            description: "Sits reliably with mild distractions as a default greeting behavior",
          },
        ],
      },
      {
        key: "puppy-fundamentals.bite-inhibition",
        name: "Bite inhibition",
        description: "Puppy learns to soften mouth pressure",
        levels: [
          {
            level: 1,
            description: "Reduces hard mouthing when given a chew toy as an alternative",
          },
          { level: 2, description: 'Stops mouthing when play pauses (gentle "ouch" + freeze)' },
          { level: 3, description: "Mostly mouths with no pressure on skin" },
          { level: 4, description: "Rare mouthing; redirects easily to toys" },
          { level: 5, description: "No mouthing of people; reliably uses appropriate chew items" },
        ],
      },
      {
        key: "puppy-fundamentals.settle-on-mat",
        name: "Settle on mat",
        description: "Puppy learns to relax in a designated spot",
        levels: [
          { level: 1, description: "Lies on mat with food scattered, owner kneeling nearby" },
          { level: 2, description: "Lies on mat for 1-2 minutes calmly" },
          { level: 3, description: "Settles on mat for 5+ minutes during low activity" },
          { level: 4, description: "Settles on mat during meal prep or other distractions" },
          {
            level: 5,
            description: "Goes to mat on cue and settles for 10+ minutes during household activity",
          },
        ],
      },
    ],
  },
  {
    key: "reactivity-work",
    name: "Reactivity Work",
    description: "Building calm responses to triggers",
    skills: [
      {
        key: "reactivity-work.threshold-awareness",
        name: "Threshold awareness",
        description: "Owner recognizes the dog's stress signals before reactivity",
        levels: [
          { level: 1, description: "Owner can identify the dog's calm baseline body language" },
          {
            level: 2,
            description: "Owner recognizes early stress signals (lip licking, freezing, ears back)",
          },
          {
            level: 3,
            description: "Owner identifies the dog's threshold distance from common triggers",
          },
          {
            level: 4,
            description: "Owner adjusts walks and setups to stay under threshold consistently",
          },
          {
            level: 5,
            description:
              "Owner anticipates and prevents over-threshold encounters in most situations",
          },
        ],
      },
      {
        key: "reactivity-work.look-at-that",
        name: "Look at that (LAT)",
        description: "Dog looks at a trigger and turns back for a reward",
        levels: [
          {
            level: 1,
            description: "Dog notices a stationary low-intensity trigger and takes a treat",
          },
          { level: 2, description: "Dog glances at trigger and orients back to owner for treat" },
          { level: 3, description: "Dog performs LAT with a moving trigger at safe distance" },
          { level: 4, description: "Dog performs LAT in moderate proximity to triggers" },
          {
            level: 5,
            description: "LAT becomes a reflexive, automatic response in trigger-rich environments",
          },
        ],
      },
      {
        key: "reactivity-work.engage-disengage",
        name: "Engage-disengage",
        description: "Dog disengages from a trigger on cue or voluntarily",
        levels: [
          {
            level: 1,
            description: "Disengages from low-intensity trigger when owner says marker word",
          },
          { level: 2, description: "Voluntarily disengages and looks at owner within 5 seconds" },
          { level: 3, description: "Disengages reliably from moderate triggers at safe distance" },
          {
            level: 4,
            description: "Disengages from triggers at closer distances or higher intensity",
          },
          { level: 5, description: "Reliable disengagement across most trigger contexts" },
        ],
      },
      {
        key: "reactivity-work.settle-in-distractions",
        name: "Settle in distractions",
        description: "Dog can settle calmly despite environmental triggers",
        levels: [
          { level: 1, description: "Settles on mat or at owner's feet in quiet outdoor space" },
          {
            level: 2,
            description: "Settles for 5+ minutes in a calm public space (e.g., quiet cafe patio)",
          },
          {
            level: 3,
            description: "Settles with mild ambient distractions (other people, dogs at distance)",
          },
          { level: 4, description: "Settles in moderately busy environments with brief check-ins" },
          { level: 5, description: "Reliable, sustained settle in busy public settings" },
        ],
      },
    ],
  },
  {
    key: "separation-comfort",
    name: "Separation Comfort",
    description: "Helping your dog feel safe alone",
    skills: [
      {
        key: "separation-comfort.calm-departures",
        name: "Calm departures",
        description: "Dog stays relaxed during the leaving routine",
        levels: [
          { level: 1, description: "Owner can pick up keys without triggering anxiety" },
          { level: 2, description: "Owner can put on coat and shoes without escalating behavior" },
          { level: 3, description: "Owner can open and close the door briefly without distress" },
          { level: 4, description: "Owner can step outside for 1-2 minutes calmly" },
          { level: 5, description: "Full departure routine elicits a calm response" },
        ],
      },
      {
        key: "separation-comfort.self-settle",
        name: "Self-settle",
        description: "Dog can relax on their own without owner attention",
        levels: [
          {
            level: 1,
            description: "Settles independently for 1-2 minutes with owner in same room",
          },
          { level: 2, description: "Settles for 5+ minutes with owner in another room" },
          { level: 3, description: "Settles for 15+ minutes with owner out of sight" },
          { level: 4, description: "Settles for 30+ minutes with low-key audio cues (music, TV)" },
          { level: 5, description: "Reliably self-settles for 1+ hour with minimal supports" },
        ],
      },
      {
        key: "separation-comfort.stay-alone-duration",
        name: "Stay-alone duration",
        description: "Dog tolerates being completely alone for increasing time",
        levels: [
          { level: 1, description: "Tolerates 2-5 minutes alone without panic behavior" },
          { level: 2, description: "Tolerates 15 minutes alone calmly" },
          {
            level: 3,
            description:
              "Tolerates 30-45 minutes alone with no destruction or excessive vocalization",
          },
          { level: 4, description: "Tolerates 1-2 hours alone reliably" },
          { level: 5, description: "Comfortable alone for typical workday lengths" },
        ],
      },
    ],
  },
  {
    key: "recall-reliability",
    name: "Recall Reliability",
    description: "A dog that comes when called, every time",
    skills: [
      {
        key: "recall-reliability.name-response",
        name: "Name response",
        description: "Dog orients to name as the start of recall",
        levels: [
          { level: 1, description: "Looks toward you when name is said in quiet space" },
          { level: 2, description: "Looks and takes a step toward you when called" },
          { level: 3, description: "Reliably orients to name in moderate distractions" },
          { level: 4, description: "Orients to name even when actively engaged" },
          { level: 5, description: "Name reliably interrupts focus on most distractions" },
        ],
      },
      {
        key: "recall-reliability.recall-on-cue",
        name: "Recall on cue",
        description: "Dog returns when called with a specific recall word",
        levels: [
          { level: 1, description: "Comes from 2-3 feet away on cue in a quiet space" },
          { level: 2, description: "Comes from across a room on cue with mild distractions" },
          { level: 3, description: "Comes from short distance (15+ feet) in fenced outdoor area" },
          { level: 4, description: "Comes from longer distance with moderate distractions" },
          { level: 5, description: "Reliable recall on cue across typical outdoor distractions" },
        ],
      },
      {
        key: "recall-reliability.recall-through-distractions",
        name: "Recall through distractions",
        description: "Dog returns even when something interesting is happening",
        levels: [
          {
            level: 1,
            description: "Recalls from low-value distraction (toy on floor) on first try",
          },
          { level: 2, description: "Recalls past mild moving distraction (person walking by)" },
          { level: 3, description: "Recalls from sniffing a moderately interesting spot" },
          { level: 4, description: "Recalls away from another dog or person at a distance" },
          { level: 5, description: "Recalls reliably from most high-value distractions" },
        ],
      },
      {
        key: "recall-reliability.recall-at-distance",
        name: "Recall at distance",
        description: "Dog returns when called from far away",
        levels: [
          { level: 1, description: "Comes when called from 10-15 feet" },
          { level: 2, description: "Comes when called from 30 feet" },
          { level: 3, description: "Comes when called from 50+ feet in fenced area" },
          { level: 4, description: "Comes when called from 100+ feet on a long line" },
          {
            level: 5,
            description:
              "Off-leash recall reliable at significant distances in appropriate settings",
          },
        ],
      },
    ],
  },
];
