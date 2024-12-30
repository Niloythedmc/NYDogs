const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');

// Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://zerox-7aa11-default-rtdb.firebaseio.com',
});

const db = admin.firestore();
const bot = new Telegraf('7545296655:AAGcSBWfDuLOsLmi7aJ-bP9UvZnvaFIKTd8');

const { session } = require('telegraf');

// Required Channels
const requiredChannels = ['@allAirdrop_Community', '@New_Ardrops', '@Airdrops_Assistants'];

// Start Command Handler
bot.start(async (ctx) => {
  const userId = ctx.from.id;  // The ID of the user starting the bot
  const userName = ctx.from.first_name || 'User';

  // Extract the referrer ID from the referral link (using ctx.startPayload)
  const referrerId = ctx.startPayload || null; // This is the userId from the referral link

  // Check if the user already exists in Firestore
  const userRef = db.collection('botusers').doc(userId.toString());
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    // Prompt user to join channels
    const message = `Welcome, ${userName}! 🎉\n\nTo continue, please join the following channels:\n\n${requiredChannels
      .map((channel) => `${channel}`)
      .join('\n')}\n\nAfter joining, click "Continue" below.`;

    await ctx.reply(message, Markup.inlineKeyboard([Markup.button.callback('Continue', 'check_membership')]));

    // User is not registered, process referral if available
    if (referrerId) {
      const referrerRef = db.collection('botusers').doc(referrerId);
      const referrerDoc = await referrerRef.get();

      if (referrerDoc.exists) {
        const referrerData = referrerDoc.data();

        // Update the referrer's balance and referral count
        await referrerRef.update({
          balance: referrerData.balance + 20,
          refers: referrerData.refers + 1,
        });

        const updatedReferrerDoc = await referrerRef.get();

        // Notify the referrer about the successful referral
        const referrerMessage = `🎉 Congratulations! You earned 20 Dogs for referring ${ctx.from.first_name}. Your new balance is ${referrerData.balance + 20} Dogs.`;
        await bot.telegram.sendMessage(referrerId, referrerMessage);
      } else {
        console.error('Referrer not found!');
      }
    }

    // Register the new user
    const balance = 100; // Set initial balance
    await userRef.set({
      id: userId,
      name: ctx.from.first_name,
      username: ctx.from.username || null,
      refers: 0,
      balance: balance,
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // User is already registered
    await ctx.reply('You are already registered. Enjoy your rewards! 🎁', Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));
  }
});


// Check Membership Handler
bot.action('check_membership', async (ctx) => {
  const userId = ctx.from.id;
  
  try {
    let allJoined = true;
    const notJoinedChannels = [];

    // Check if the user has joined all required channels
    for (const channel of requiredChannels) {
      try {
        const chatMember = await ctx.telegram.getChatMember(channel, userId);

        if (
          chatMember.status !== 'member' &&
          chatMember.status !== 'administrator' &&
          chatMember.status !== 'creator'
        ) {
          allJoined = false;
          notJoinedChannels.push(channel);
        }
      } catch (error) {
        allJoined = false;
        notJoinedChannels.push(channel); // Assume not joined if API fails
      }
    }

    if (allJoined) {
      const userRef = db.collection('botusers').doc(userId.toString());
      const userDoc = await userRef.get();

        // Send success message
        const balanceMessage = `🎉 Congratulations, ${ctx.from.first_name}! You've earned ${balance} Dogs! 🐶\n\nHere is your referral link to invite friends and earn 20 Dogs per referral:\nhttps://t.me/NYDogs_bot?start=${userId}`;
        await ctx.editMessageText(balanceMessage, Markup.inlineKeyboard([
          [Markup.button.callback('Balance: ' + balance + ' Dogs', 'check_balance')],
          [Markup.button.callback('Refers: 0', 'check_refers')],
          [Markup.button.callback('Withdraw', 'withdraw')],
          [Markup.button.callback('Leaderboard', 'leaderboard')]
        ]));
    } else {
      // Notify user of channels they haven't joined
      await ctx.editMessageText(
        `❌ You have not joined the following channels:\n\n${notJoinedChannels
          .map((channel) => `${channel}`)
          .join('\n')}\n\nPlease join these channels to continue.`,
        Markup.inlineKeyboard([Markup.button.callback('Continue', 'check_membership')])
      );
    }
  } catch (error) {
    console.error('Error in check_membership:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
});

// Balance Button Handler
bot.action('check_balance', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userRef = db.collection('botusers').doc(userId.toString());
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const balanceMessage = `💰 Your current balance is: ${userData.balance} Dogs 🐶\n\nHere is your referral link to increase your balance: https://t.me/NYDogs_bot?start=${userId}`;
      await ctx.editMessageText(balanceMessage, Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));
    }
  } catch (error) {
    console.error('Error in check_balance:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
});

// Refers Button Handler
bot.action('check_refers', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userRef = db.collection('botusers').doc(userId.toString());
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const refersMessage = `👥 Your current referrals: ${userData.refers}\n\nShare your link to get more referrals: https://t.me/NYDogs_bot?start=${userId}`;
      await ctx.editMessageText(refersMessage, Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));
    }
  } catch (error) {
    console.error('Error in check_refers:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
});



// Enable session middleware
bot.use(session());  // Make sure session middleware is enabled

// Initialize session if not present
bot.use((ctx, next) => {
  if (!ctx.session) {
    ctx.session = {}; // Initialize session if undefined
  }
  next();
});

// Withdraw Button Handler
bot.action('withdraw', async (ctx) => {
  try {
    const userId = ctx.from.id;

    // Fetch user data
    const userRef = db.collection('botusers').doc(userId.toString());
    const userDoc = await userRef.get();

    if (userDoc.exists && userDoc.data().balance >= 500) {
      // Initialize withdrawal session if not already
      if (!ctx.session.withdrawal) {
        ctx.session.withdrawal = {};
      }

      // Start withdrawal process
      ctx.session.withdrawal.step = 1; // Initialize withdrawal step
      await ctx.editMessageText(
        'Please enter your withdrawal address. Make sure to double-check it before submitting.',
        Markup.inlineKeyboard([Markup.button.callback('Back', 'home')])
      );
    } else {
      await ctx.editMessageText('❗ Minimum withdrawal amount is 500 Dogs.', Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));
    }
  } catch (error) {
    console.error('Error in withdraw:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
});

// Handle Withdrawal Inputs
bot.on('message', async (ctx) => {
  try {
    // Skip unrelated messages (only handle withdrawal flow)
    if (!ctx.session.withdrawal) return;

    const { step } = ctx.session.withdrawal;
    const userId = ctx.from.id;

    // Step 1: Enter withdrawal address
    if (step === 1) {
      ctx.session.withdrawal.address = ctx.message.text;
      ctx.session.withdrawal.step = 2;
      await ctx.reply('Enter the memo (default is NULL if not required).', Markup.inlineKeyboard([Markup.button.callback('Back', 'whome')])); 
    } 
    // Step 2: Enter memo
    else if (step === 2) {
      ctx.session.withdrawal.memo = ctx.message.text || 'NULL';
      ctx.session.withdrawal.step = 3;
      await ctx.reply('Enter the amount to withdraw (Minimum is 500 Dogs):', Markup.inlineKeyboard([Markup.button.callback('Back', 'whome')])); 
    } 
    // Step 3: Enter withdrawal amount
    else if (step === 3) {
      const amount = parseFloat(ctx.message.text);
      if (isNaN(amount) || amount <= 0) {
        await ctx.reply('❗ Invalid amount. Please enter a valid number.');
      } else if (amount < 500) {
        await ctx.reply('❗ The withdrawal amount must be greater than or equal to 500 Dogs. Please enter a valid amount.', Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));
      } else {
        ctx.session.withdrawal.amount = amount;
        await ctx.reply(
          `Withdrawal request details:\n\nAddress: ${ctx.session.withdrawal.address}\nMemo: ${ctx.session.withdrawal.memo}\nAmount: ${amount} Dogs\n\nIs this correct? (Yes/No)`,
          Markup.inlineKeyboard([Markup.button.callback('Yes', 'confirm_withdraw'), Markup.button.callback('No', 'nowithdraw')])
        );
      }
    }
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
});

// Handle "Back" button to return to the previous step (home or cancel)
bot.action('whome', async (ctx) => {
  try {
    // Reset withdrawal process by clearing session state
    ctx.session.withdrawal = null;
    await ctx.reply('Withdrawal process has been canceled. Returning to home.', Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));
  } catch (error) {
    console.error('Error handling "Home" action:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
});

bot.action('confirm_withdraw', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const withdrawal = ctx.session.withdrawal;

    // Ensure that all required details are provided
    if (withdrawal.amount && withdrawal.address && withdrawal.memo) {
      const userRef = db.collection('botusers').doc(userId.toString());
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const userData = userDoc.data();

        // Check if the user has enough balance
        if (userData.balance >= withdrawal.amount) {
          // Deduct balance and confirm withdrawal
          await userRef.update({
            balance: userData.balance - withdrawal.amount,
          });

          // Store withdrawal request in the Withdrawals collection, under a subcollection for each user
          const withdrawalRef = db.collection('Withdrawals').doc(userId.toString());

          // Store the withdrawal request with timestamp
          await withdrawalRef.set({
            address: withdrawal.address,
            memo: withdrawal.memo,
            amount: withdrawal.amount,
            timestamp: admin.firestore.FieldValue.serverTimestamp(), // Proper timestamp
          });

          // Send confirmation message
          await ctx.reply(`✅ Withdrawal successful! You have withdrawn ${withdrawal.amount} Dogs. It will complete shortly...`, Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));

          // Clear withdrawal session after confirmation
          ctx.session.withdrawal = null;
        } else {
          await ctx.reply('❗ Insufficient balance for this withdrawal.', Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));
        }
      } else {
        console.error('User data not found during withdrawal process.');
        await ctx.reply('An error occurred. Please try again later.');
      }
    } else {
      console.error('Withdrawal details are missing.');
      await ctx.reply('❗ Please ensure all withdrawal details are entered correctly.');
    }
  } catch (error) {
    console.error('Error in confirm_withdraw:', error);
    await ctx.reply('An error occurred while processing your withdrawal. Please try again later.');
  }
});

// Handle "No" on withdrawal confirmation (cancel withdrawal)
bot.action('nowithdraw', async (ctx) => {
  try {
    // Reset the withdrawal session to cancel
    ctx.session.withdrawal = null;
    await ctx.reply('Withdrawal process has been canceled. Returning to home.', Markup.inlineKeyboard([Markup.button.callback('Home', 'home')]));
  } catch (error) {
    console.error('Error canceling withdrawal:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
});

// Home Button Handler
bot.action('home', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userRef = db.collection('botusers').doc(userId.toString());
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      await ctx.editMessageText(
        `Welcome back, ${ctx.from.first_name}! 🎉\n\nYour balance: ${userData.balance} Dogs 🐶.\n\nHere is your referral link to invite friends and earn 20 Dogs per referral:\nhttps://t.me/NYDogs_bot?start=${userId}\n\nSelect an option:`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Balance: ' + `${userData.balance}` + ' dogs', 'check_balance')],
          [Markup.button.callback('Refers: ' + `${userData.refers}`, 'check_refers')],
          [Markup.button.callback('Withdraw', 'withdraw')],
          [Markup.button.callback('Leaderboard', 'leaderboard')]
        ])
      );
    }
  } catch (error) {
    console.error('Error in home action:', error);
    await ctx.reply('An error occurred. Please try again later.');
  }
});

bot.launch();