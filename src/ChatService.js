/**
 * Class representing a chat service.
 */
class ChatService {

  /**
   * Constructor.
   * @param {MessageEmbed} DiscordMessageEmbed - Discord.js MessageEmbed class for creating rich embed messages.
   */
  constructor(DiscordMessageEmbed) {
    this.DiscordMessageEmbed = DiscordMessageEmbed;

    /** @property {Enum} msgType - Message Type for simple Note */
    this.msgType = {
      "FAIL": "fail",
      "INFO": "info",
      "MUSIC": "music",
      "SEARCH": "search"
    };
  }

  /**
   * Send a simple note to Discord with an emoji depending of the given message Type.
   * @param {Message} msg - User message this function is invoked by.
   * @param {string|Error} text - The text to be displayed in this note (can be of type Error).
   * @param {string} type - Message type defined by {@link ChatService#msgType}.
   */
  simpleNote(msg, text, type) {
    this.debugPrint(text);
    let ret = new Promise((resolve) => resolve({"delete": () => null}));
    if (typeof msg.channel === "undefined") {
      return ret;
    }
    text.toString().split("\n").
      forEach((line) => {
        switch (type) {
        case this.msgType.INFO:
          ret = msg.channel.send(`:information_source: | ${line}`);
          return;
        case this.msgType.MUSIC:
          ret = msg.channel.send(`:musical_note: | ${line}`);
          return;
        case this.msgType.SEARCH:
          ret = msg.channel.send(`:mag: | ${line}`);
          return;
        case this.msgType.FAIL:
          ret = msg.channel.send(`:x: | ${line}`);
          return;
        default:
          ret = msg.channel.send(`${line}`);
        }
      });
    return ret;
  }

  /**
   * Send either plain text or a MessageEmbed in markdown style.
   * @see {@link https://discord.js.org/#/docs/main/master/class/MessageEmbed} MessageEmbed API.
   * @see {@link https://leovoel.github.io/embed-visualizer/} MessageEmbed previewer.
   * @param {Message} msg - User message this function is invoked by.
   * @param {string|MessageEmbed} content -The content to be sent as a discord message.
   */
  send(msg, content) {
    this.debugPrint(content);
    if (typeof msg.channel === "undefined") {
      return new Promise((resolve) => resolve({"delete": () => null}));
    }
    return msg.channel.send(content);
  }

  /**
   * Display paged content with reaction based navigation.
   * @param {Message} msg - User message this function is invoked by.
   * @param {string[]|MessageEmbed[]} pages - Pages to be displayed.
   */
  pagedContent(msg, pages) {
    this.debugPrint(pages);
    if (typeof msg.channel === "undefined") {
      return;
    }
    let page = 0;
    // Build choose menu.
    msg.channel.send(pages[0]).
      // Add reactions for page navigation.
      then((curPage) => this.postReactionEmojis(curPage, ["⏪", "⏩"]).then(() => {
        // Add listeners to reactions.
        const nextReaction = curPage.createReactionCollector(
          (reaction, user) => reaction.emoji.name === "⏩" && user.id === msg.author.id,
          {"time": 120000}
        );
        const backReaction = curPage.createReactionCollector(
          (reaction, user) => reaction.emoji.name === "⏪" && user.id === msg.author.id,
          {"time": 120000}
        );
        // Handle reactions.
        nextReaction.on("collect", (reaction) => {
          reaction.users.remove(msg.author);
          if ((page + 1) < pages.length) {
            ++page;
            curPage.edit(pages[page]);
          }
        });
        backReaction.on("collect", (reaction) => {
          reaction.users.remove(msg.author);
          if (page > 0) {
            --page;
            curPage.edit(pages[page]);
          }
        });
        nextReaction.on("end", () => curPage.reactions.removeAll());
        backReaction.on("end", () => curPage.reactions.removeAll());
      }));
  }

  /**
   * Display a song in pretty markdown and add reaction based user rating.
   * @param {Message} msg - User message this function is invoked by.
   * @param {Song} song - Song to be displayed.
   * @param {function} processRating - Function to be invoked if rating was given.
   */
  displaySong(msg, song, processRating) {
    this.debugPrint(song);
    if (typeof msg.channel === "undefined") {
      return;
    }
    // Build Song embed.
    msg.channel.send(this.buildSongEmbed(song)).
      // Add reactions for song rating.
      then((songMsg) => this.postReactionEmojis(songMsg, ["⏫", "⏬", "💩"]).
        then(() => {
        // Add listeners to reactions.
          const upReaction = songMsg.createReactionCollector(
            (reaction, user) => (reaction.emoji.name === "⏫" && (!user.bot)),
            {"time": 600000}
          );
          const downReaction = songMsg.createReactionCollector(
            (reaction, user) => (reaction.emoji.name === "⏬" && (!user.bot)),
            {"time": 600000}
          );
          const poopReaction = songMsg.createReactionCollector(
            (reaction, user) => (reaction.emoji.name === "💩" && (!user.bot)),
            {"time": 600000}
          );
          // Handle reactions.
          upReaction.on("collect", (reaction) => {
            this.handleRatingReaction(reaction, song, 1, processRating);
          });
          downReaction.on("collect", (reaction) => {
            this.handleRatingReaction(reaction, song, -1, processRating);
          });
          poopReaction.on("collect", (reaction) => {
            const note = "Let me clean that 💩 for you";
            this.simpleNote(reaction.message, note, this.msgType.MUSIC);
            this.handleRatingReaction(reaction, song, -1000, processRating, true);
          });
          upReaction.on("end", () => songMsg.reactions.removeAll());
          downReaction.on("end", () => songMsg.reactions.removeAll());
          poopReaction.on("end", () => songMsg.reactions.removeAll());
        }));
  }

  /**
   * Create a collector for messages and execute followup commands.
   * @param {Message} msg - User message this function is invoked by.
   * @param {function} filter - function to filter the collected messages and determine which ones should be processed.
   * @param {function} process - Function to be invoked if a message passed the filter.
   */
  awaitCommand(msg, filter, process) {
    msg.channel.awaitMessages(filter, {"errors": ["time"], "max": 1, "time": 120000}).
      then(process).
      // Timeout or error.
      catch((err) => this.simpleNote(msg, err, this.msgType.FAIL));
  }

  /**
   * React with an array of Emojis to a given message
   * @private
   * @param {Message} msg - User message this function is invoked by.
   * @param {string[]} emojiList Ordered list of emojis to post.
   */
  postReactionEmojis(msg, emojiList) {
    return new Promise((resolve, reject) => {
      msg.react(emojiList.shift()).
        then(() => {
          if (emojiList.length > 0) {
            // Send all reactions recursively.
            this.postReactionEmojis(msg, emojiList).
              then(resolve).
              catch(reject);
          } else {
            resolve();
          }
        }).
        catch(reject);
    });
  }

  /**
   * Process reaction based user rating.
   * @private
   * @param {MessageReaction} reaction - given user reaction.
   * @param {Song} song - Song to be rated.
   * @param {number} delta - Delta rating score.
   * @param {function} processRating - Function to be invoked if rating was given.
   * @param {boolean} ignoreCd - Flag to indicate if the cooldown should be ignored.
   */
  handleRatingReaction(reaction, song, delta, processRating, ignoreCd = false) {
    reaction.users.filter((user) => !user.bot).forEach((user) => {
      reaction.users.remove(user);
      processRating(song, user, delta, ignoreCd).
        then((note) => {
          reaction.message.edit(this.buildSongEmbed(song));
          if (note) {
            this.simpleNote(reaction.message, note, this.msgType.MUSIC);
          }
        }).
        catch((err) => this.simpleNote(reaction.message, err, this.msgType.FAIL));
    });
  }

  /**
   * Build a MessageEmbed for a song with markdown.
   * @private
   * @param {Song} song - Song to be displayed.
   */
  buildSongEmbed(song) {
    const embed = new this.DiscordMessageEmbed();
    for (const key in song) {
      if (song[key] === "") {
        song[key] = "-";
      }
    }
    embed.setColor(890629);
    embed.addField("Title", song.title, true);
    embed.addField("Artist", song.artist, true);
    embed.addBlankField();
    embed.addField("Requester", song.requester, true);
    embed.addField("Rating", song.rating, true);
    embed.addField("Source", song.src, true);
    return embed;
  }

  /**
   * Print color coded debug information for all chat interactions to console log.
   * @private
   * @param {string|MessageEmbed|Error} content Content to be logged.
   */
  debugPrint(content) {
    if (content instanceof Error) {
      console.log("\x1b[31m%s\x1b[0m", content.stack);
    } else if (typeof content === "object") {
      console.log("\x1b[36m%s\x1b[0m", JSON.stringify(content, null, 4).replace(/\\n/gu, "\n"));
    } else {
      console.log("\x1b[36m%s\x1b[0m", content);
    }
  }
}

module.exports = ChatService;
