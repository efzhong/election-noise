**Election Noise**

Political ads don’t arrive evenly across the country and some states have an overwhelming flow of ads before election day. I'm interested in noise as something you can watch and something you can hear.

This map shows every US congressional district and the spending figures come from Google’s Political Ads Transparency Report. Google publishes this as a public dataset in BigQuery. I took every election ad that started running between January 1, 2025 and Election Day, November 3, 2026, and added up the spending by state.

Google doesn’t publish an exact amount per ad (only ranges) like \$1,000 to \$50,000 so I used the middle of each range. When one ad targeted several states, I split its spending evenly between them. Ads aimed at the whole country were left out in case they raise every state equally and say little about where attention was concentrated.

The district boundaries load live from the Census Bureau’s TIGERweb service each time the page opens. In states where campaigns spent little on Google and YouTube ads during the 2026 midterm cycle, the lines barely drift. In states where they spent heavily, the lines tremble and break into tight, quick waves.

Click the map and hover over a state to hear it! **Warning: There will be a soft, muffled hiss for low-spending states, and a louder, brighter one where the money was concentrated.**

I was inspired by the logic behind how borders move using Perlin noise, through p5.js’s noise() function by Caleb Foss. Perlin noise produces smooth, connected randomness. In this vein, two nearby points get similar values so a border bends in waves instead of breaking into static. Every point along a border samples the noise field at its own position, and a third input (time) moves slowly so the shapes keep shifting.

Spending changes three settings:

1.  How far the points move (amplitude)
2.  How tightly the waves bunch together (frequency): broad, slow swells where spending was low, and fine, jittery ripples where it was high
3.  How fast the noise moves over time

Using the help of Claude.ai, I was able to figure out that spending should be put on a log scale before it’s mapped to motion. Without that, the few biggest races would dominate and almost every other state would look completely still (and I would still be troubleshooting).

Regarding sound, the hiss is pink noise generated live in the browser with p5.sound. It runs through a low-pass filter, which cuts the high frequencies and makes it sound muffled. When you hover over a state, the state’s spending sets the volume and how much of the high end the filter lets through. Low-spending states sound like muffled static while high-spending states sound more frenetic and closer to you (in a similar way where you may feel the midterm ads have surrounded you for weeks). The volume slider and mute button under the map set the overall level for anyone who wants to adjust the sound.

Please note that due to limitations to what I could find, this only covers ads on Google and YouTube. Political ad money also goes to broadcast TV and streaming, which were harder for me to track down. Spending is calculated by state, so every district in a state moves at the same level. The district lines are there for texture and scale, not as separate measurements. Each district would need its own figure for that, which could come from matching ZIP-targeted ads to districts. However, I personally found it amazing how much is spent solely on what's shown in this map -- there are millions more that go into these campaigns. As someone who doesn't pay for cable, I do wonder if the ads shown on YouTube are perhaps created to reach a different demographic than one that consistently watches TV.

Links to the wonderful sources that inspired this: 
https://en.wikipedia.org/wiki/Perlin_noise
https://p5js.org/examples/Repetition-Noise/
