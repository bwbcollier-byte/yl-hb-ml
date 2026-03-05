import fetch from "node-fetch";

async function testQuery(spotifyUrl: string) {
  console.log(`Querying MusicBrainz for URL: ${spotifyUrl}`);
  const url = `https://musicbrainz.org/ws/2/url?resource=${encodeURIComponent(spotifyUrl)}&inc=artist-rels&fmt=json`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "HBTalentMusicProfilesTest/1.0 (contact@yunikon-labs.com)",
        Accept: "application/json",
      },
    });

    console.log(`Status: ${response.status}`);
    if (!response.ok) {
      console.error("Error response:", await response.text());
      return;
    }

    const data = await response.json();
    console.log("Response summary:");
    console.log(JSON.stringify(data, null, 2));

    if (data.relations && data.relations.length > 0) {
      const artistRel = data.relations.find(
        (r: any) => r["target-type"] === "artist" || r.artist,
      );
      if (artistRel && artistRel.artist) {
        console.log(`\n✅ Found Artist MBID: ${artistRel.artist.id}`);
        console.log(`Name: ${artistRel.artist.name}`);

        // Now try fetching the full artist info based on this MBID
        console.log(
          `\nNow fetching full artist info for MBID: ${artistRel.artist.id}`,
        );
        const artistUrl = `https://musicbrainz.org/ws/2/artist/${artistRel.artist.id}?inc=aliases+tags+ratings+url-rels+artist-rels+release-groups&fmt=json`;
        const artistResponse = await fetch(artistUrl, {
          headers: {
            "User-Agent":
              "HBTalentMusicProfilesTest/1.0 (contact@yunikon-labs.com)",
            Accept: "application/json",
          },
        });

        if (artistResponse.ok) {
          const artistData = await artistResponse.json();
          console.log(
            `\nArtist Data Keys: ${Object.keys(artistData).join(", ")}`,
          );
          console.log(`Artist Name: ${artistData.name}`);
          console.log(`Country: ${artistData.country}`);
          console.log(
            `Tags: ${artistData.tags
              ?.map((t: any) => t.name)
              .slice(0, 5)
              .join(", ")}`,
          );
          console.log(
            `URLs: ${artistData.relations?.filter((r: any) => r["target-type"] === "url").length || 0} found`,
          );
        }
      } else {
        console.log("\n❌ No artist relations found for this URL.");
      }
    } else {
      console.log("\n❌ No relations found for this URL.");
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

const testUrl =
  process.argv[2] || "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02";
testQuery(testUrl);
