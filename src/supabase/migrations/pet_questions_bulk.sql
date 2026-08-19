-- Bulk insert: pet_question_bank questions for levels 1-4
-- Categories: grammar, tenses, prepositions, vocabulary, reading
-- Run this in Supabase SQL Editor

INSERT INTO pet_question_bank (question, choices, answer_index, category, min_level) VALUES

-- ============================================================
-- LEVEL 1 — Beginner (basic vocab, colors, animals, numbers, greetings)
-- ============================================================

-- Vocabulary: Colors
('What color is the sky?', '["red", "blue", "green", "yellow"]', 1, 'vocabulary', 1),
('What color is grass?', '["red", "blue", "green", "yellow"]', 2, 'vocabulary', 1),
('What color is the sun?', '["red", "blue", "green", "yellow"]', 3, 'vocabulary', 1),
('What color is a banana?', '["red", "blue", "green", "yellow"]', 3, 'vocabulary', 1),
('What color is snow?', '["black", "white", "brown", "pink"]', 1, 'vocabulary', 1),
('What color is an orange?', '["purple", "pink", "orange", "gray"]', 2, 'vocabulary', 1),
('A tomato is ___.', '["blue", "green", "yellow", "red"]', 3, 'vocabulary', 1),
('Chocolate is ___.', '["white", "brown", "pink", "gray"]', 1, 'vocabulary', 1),

-- Vocabulary: Animals
('A ___ says "meow".', '["dog", "bird", "cat", "fish"]', 2, 'vocabulary', 1),
('A ___ says "woof".', '["cat", "dog", "fish", "bird"]', 1, 'vocabulary', 1),
('A ___ can fly.', '["fish", "cat", "dog", "bird"]', 3, 'vocabulary', 1),
('A ___ lives in water.', '["cat", "dog", "bird", "fish"]', 3, 'vocabulary', 1),
('A ___ gives us milk.', '["hen", "cow", "cat", "duck"]', 1, 'vocabulary', 1),
('A ___ gives us eggs.', '["cow", "dog", "hen", "fish"]', 2, 'vocabulary', 1),
('A ___ has a long neck.', '["cat", "dog", "giraffe", "fish"]', 2, 'vocabulary', 1),
('A ___ is very big and gray.', '["cat", "rabbit", "bird", "elephant"]', 3, 'vocabulary', 1),
('A ___ hops and has long ears.', '["rabbit", "fish", "bird", "cow"]', 0, 'vocabulary', 1),
('A ___ has eight legs.', '["ant", "bird", "spider", "dog"]', 2, 'vocabulary', 1),

-- Vocabulary: Numbers
('How many legs does a dog have?', '["2", "3", "4", "5"]', 2, 'vocabulary', 1),
('How many eyes do you have?', '["1", "2", "3", "4"]', 1, 'vocabulary', 1),
('How many fingers on one hand?', '["3", "4", "5", "6"]', 2, 'vocabulary', 1),
('How many days in a week?', '["5", "6", "7", "8"]', 2, 'vocabulary', 1),
('How many months in a year?', '["10", "11", "12", "13"]', 2, 'vocabulary', 1),

-- Vocabulary: Body parts
('You see with your ___.', '["ears", "eyes", "nose", "mouth"]', 1, 'vocabulary', 1),
('You hear with your ___.', '["ears", "eyes", "nose", "hands"]', 0, 'vocabulary', 1),
('You smell with your ___.', '["ears", "eyes", "nose", "mouth"]', 2, 'vocabulary', 1),
('You eat with your ___.', '["ears", "eyes", "nose", "mouth"]', 3, 'vocabulary', 1),
('You write with your ___.', '["foot", "hand", "ear", "nose"]', 1, 'vocabulary', 1),
('You walk with your ___.', '["hands", "eyes", "feet", "ears"]', 2, 'vocabulary', 1),

-- Vocabulary: Food & Drink
('You drink ___ when you are thirsty.', '["bread", "rice", "water", "cake"]', 2, 'vocabulary', 1),
('You eat ___ for breakfast. (cơm)', '["rice", "water", "milk", "juice"]', 0, 'vocabulary', 1),
('An apple is a ___.', '["vegetable", "fruit", "drink", "meat"]', 1, 'vocabulary', 1),
('A carrot is a ___.', '["fruit", "vegetable", "drink", "meat"]', 1, 'vocabulary', 1),
('Ice cream is ___.', '["hot", "cold", "sour", "salty"]', 1, 'vocabulary', 1),

-- Vocabulary: Family
('Your mother''s mother is your ___.', '["aunt", "sister", "grandmother", "cousin"]', 2, 'vocabulary', 1),
('Your father''s brother is your ___.', '["uncle", "brother", "cousin", "grandfather"]', 0, 'vocabulary', 1),
('Your mother and father are your ___.', '["friends", "parents", "teachers", "brothers"]', 1, 'vocabulary', 1),

-- Grammar: to be (am/is/are)
('I ___ a student.', '["is", "am", "are", "be"]', 1, 'grammar', 1),
('She ___ my friend.', '["am", "is", "are", "be"]', 1, 'grammar', 1),
('They ___ happy.', '["am", "is", "are", "be"]', 2, 'grammar', 1),
('He ___ tall.', '["am", "is", "are", "be"]', 1, 'grammar', 1),
('We ___ in the classroom.', '["am", "is", "are", "be"]', 2, 'grammar', 1),
('It ___ a cat.', '["am", "is", "are", "be"]', 1, 'grammar', 1),
('I ___ 10 years old.', '["is", "am", "are", "was"]', 1, 'grammar', 1),
('You ___ very kind.', '["am", "is", "are", "was"]', 2, 'grammar', 1),
('The dog ___ big.', '["am", "are", "is", "be"]', 2, 'grammar', 1),
('My parents ___ teachers.', '["is", "am", "are", "was"]', 2, 'grammar', 1),

-- Grammar: this/that/these/those
('___ is my pen. (near)', '["That", "This", "Those", "These"]', 1, 'grammar', 1),
('___ are my books. (near)', '["That", "This", "Those", "These"]', 3, 'grammar', 1),
('___ is a bird. (far)', '["This", "That", "These", "Those"]', 1, 'grammar', 1),
('___ are trees. (far)', '["This", "That", "These", "Those"]', 3, 'grammar', 1),

-- Grammar: singular/plural
('One cat, two ___.', '["cat", "cats", "cates", "catis"]', 1, 'grammar', 1),
('One box, three ___.', '["boxs", "box", "boxes", "boxies"]', 2, 'grammar', 1),
('One child, many ___.', '["childs", "childes", "children", "child"]', 2, 'grammar', 1),
('One fish, five ___.', '["fishs", "fishes", "fish", "fishies"]', 2, 'grammar', 1),
('One tooth, many ___.', '["tooths", "teeth", "toothes", "teeths"]', 1, 'grammar', 1),
('One man, two ___.', '["mans", "man", "men", "mens"]', 2, 'grammar', 1),

-- Vocabulary: Days & Months
('The first day of the week is ___.', '["Monday", "Sunday", "Saturday", "Friday"]', 0, 'vocabulary', 1),
('The last month of the year is ___.', '["January", "November", "October", "December"]', 3, 'vocabulary', 1),
('After Monday comes ___.', '["Wednesday", "Tuesday", "Sunday", "Thursday"]', 1, 'vocabulary', 1),
('After Friday comes ___.', '["Thursday", "Monday", "Saturday", "Sunday"]', 2, 'vocabulary', 1),

-- Vocabulary: Classroom
('You write on the ___.', '["chair", "desk", "board", "door"]', 2, 'vocabulary', 1),
('You sit on a ___.', '["board", "door", "table", "chair"]', 3, 'vocabulary', 1),
('You read a ___.', '["pen", "ruler", "book", "bag"]', 2, 'vocabulary', 1),
('You use a ___ to draw a line.', '["pen", "ruler", "eraser", "book"]', 1, 'vocabulary', 1),
('You use an ___ to remove pencil marks.', '["pen", "ruler", "eraser", "book"]', 2, 'vocabulary', 1),

-- Vocabulary: Weather
('When it rains, you need an ___.', '["hat", "umbrella", "shoe", "bag"]', 1, 'vocabulary', 1),
('In summer, it is ___.', '["cold", "cool", "hot", "freezing"]', 2, 'vocabulary', 1),
('In winter, it is ___.', '["hot", "warm", "cool", "cold"]', 3, 'vocabulary', 1),
('When it is sunny, the sky is ___.', '["gray", "black", "blue", "white"]', 2, 'vocabulary', 1),

-- Vocabulary: Opposites
('The opposite of "big" is ___.', '["tall", "small", "long", "short"]', 1, 'vocabulary', 1),
('The opposite of "hot" is ___.', '["warm", "cool", "cold", "wet"]', 2, 'vocabulary', 1),
('The opposite of "happy" is ___.', '["angry", "sad", "tired", "scared"]', 1, 'vocabulary', 1),
('The opposite of "fast" is ___.', '["quick", "slow", "strong", "weak"]', 1, 'vocabulary', 1),
('The opposite of "old" is ___.', '["big", "small", "new", "long"]', 2, 'vocabulary', 1),
('The opposite of "up" is ___.', '["left", "right", "down", "back"]', 2, 'vocabulary', 1),
('The opposite of "open" is ___.', '["close", "shut", "lock", "break"]', 0, 'vocabulary', 1),
('The opposite of "day" is ___.', '["morning", "evening", "night", "noon"]', 2, 'vocabulary', 1),

-- Greetings
('When you meet someone, you say ___.', '["Goodbye", "Sorry", "Hello", "Thanks"]', 2, 'grammar', 1),
('When you leave, you say ___.', '["Hello", "Goodbye", "Please", "Sorry"]', 1, 'grammar', 1),
('When someone helps you, you say ___.', '["Sorry", "Hello", "Please", "Thank you"]', 3, 'grammar', 1),
('When you want something, you say ___.', '["Sorry", "Hello", "Please", "Goodbye"]', 2, 'grammar', 1),
('"Good morning" is for the ___.', '["night", "afternoon", "morning", "evening"]', 2, 'grammar', 1),

-- ============================================================
-- LEVEL 2 — Elementary (basic sentences, have/has, can, there is/are)
-- ============================================================

-- Grammar: have / has
('I ___ a new bag.', '["has", "have", "having", "had"]', 1, 'grammar', 2),
('She ___ two brothers.', '["have", "has", "having", "had"]', 1, 'grammar', 2),
('They ___ a big house.', '["has", "have", "having", "is"]', 1, 'grammar', 2),
('He ___ a red car.', '["have", "has", "having", "had"]', 1, 'grammar', 2),
('We ___ many friends.', '["has", "have", "having", "is"]', 1, 'grammar', 2),
('My cat ___ blue eyes.', '["have", "has", "having", "had"]', 1, 'grammar', 2),
('Tom ___ a pet dog.', '["have", "has", "having", "is"]', 1, 'grammar', 2),
('I ___ long hair.', '["has", "have", "having", "am"]', 1, 'grammar', 2),

-- Grammar: there is / there are
('There ___ a book on the desk.', '["are", "is", "am", "be"]', 1, 'grammar', 2),
('There ___ three cats in the garden.', '["is", "are", "am", "be"]', 1, 'grammar', 2),
('There ___ some milk in the glass.', '["are", "is", "am", "be"]', 1, 'grammar', 2),
('There ___ many students in the class.', '["is", "are", "am", "be"]', 1, 'grammar', 2),
('___ there a park near your house?', '["Are", "Is", "Am", "Do"]', 1, 'grammar', 2),
('___ there any apples?', '["Is", "Are", "Do", "Does"]', 1, 'grammar', 2),
('There ___ an elephant at the zoo.', '["are", "is", "am", "were"]', 1, 'grammar', 2),
('There ___ no water in the bottle.', '["are", "is", "am", "were"]', 1, 'grammar', 2),

-- Grammar: can / can't
('I ___ speak English.', '["am", "is", "can", "does"]', 2, 'grammar', 2),
('She ___ dance very well.', '["is", "does", "can", "has"]', 2, 'grammar', 2),
('Fish ___ swim.', '["is", "are", "has", "can"]', 3, 'grammar', 2),
('Birds ___ fly.', '["is", "are", "has", "can"]', 3, 'grammar', 2),
('A baby ___ drive a car.', '["can", "can''t", "is", "does"]', 1, 'grammar', 2),
('He ___ ride a bike. He is too young.', '["can", "can''t", "is", "does"]', 1, 'grammar', 2),
('___ you play the guitar?', '["Are", "Do", "Can", "Is"]', 2, 'grammar', 2),
('I ___ run very fast.', '["am", "is", "has", "can"]', 3, 'grammar', 2),

-- Grammar: possessive ('s)
('This is ___ book. (Nam)', '["Nam", "Nams", "Nam''s", "of Nam"]', 2, 'grammar', 2),
('That is my ___ car. (father)', '["father", "fathers", "father''s", "of father"]', 2, 'grammar', 2),
('The ___ tail is long. (cat)', '["cat", "cats", "cat''s", "of cat"]', 2, 'grammar', 2),

-- Vocabulary: Jobs
('A ___ teaches students.', '["doctor", "teacher", "farmer", "driver"]', 1, 'vocabulary', 2),
('A ___ helps sick people.', '["teacher", "doctor", "farmer", "cook"]', 1, 'vocabulary', 2),
('A ___ grows rice.', '["doctor", "teacher", "farmer", "driver"]', 2, 'vocabulary', 2),
('A ___ drives a bus.', '["teacher", "farmer", "cook", "driver"]', 3, 'vocabulary', 2),
('A ___ cooks food in a restaurant.', '["teacher", "chef", "driver", "nurse"]', 1, 'vocabulary', 2),
('A ___ puts out fires.', '["police officer", "firefighter", "doctor", "teacher"]', 1, 'vocabulary', 2),
('A ___ catches bad people.', '["firefighter", "doctor", "police officer", "farmer"]', 2, 'vocabulary', 2),
('A ___ flies an airplane.', '["driver", "captain", "pilot", "sailor"]', 2, 'vocabulary', 2),

-- Vocabulary: Clothes
('You wear ___ on your feet.', '["hat", "gloves", "shoes", "shirt"]', 2, 'vocabulary', 2),
('You wear a ___ on your head.', '["shoe", "hat", "glove", "sock"]', 1, 'vocabulary', 2),
('You wear ___ when it is cold.', '["shorts", "a T-shirt", "a jacket", "sandals"]', 2, 'vocabulary', 2),
('You wear ___ to go swimming.', '["a coat", "a sweater", "a swimsuit", "boots"]', 2, 'vocabulary', 2),

-- Vocabulary: Rooms in a house
('You cook food in the ___.', '["bedroom", "bathroom", "kitchen", "garden"]', 2, 'vocabulary', 2),
('You sleep in the ___.', '["kitchen", "bedroom", "bathroom", "living room"]', 1, 'vocabulary', 2),
('You take a bath in the ___.', '["kitchen", "bedroom", "bathroom", "garden"]', 2, 'vocabulary', 2),
('You watch TV in the ___.', '["kitchen", "bathroom", "bedroom", "living room"]', 3, 'vocabulary', 2),

-- Vocabulary: Subjects
('In Math class, you learn about ___.', '["words", "numbers", "animals", "songs"]', 1, 'vocabulary', 2),
('In English class, you learn to ___.', '["draw", "count", "speak English", "run"]', 2, 'vocabulary', 2),
('In Science class, you learn about ___.', '["grammar", "history", "nature", "music"]', 2, 'vocabulary', 2),
('In P.E. class, you ___.', '["read", "write", "exercise", "paint"]', 2, 'vocabulary', 2),

-- Grammar: like + V-ing
('I like ___ soccer.', '["play", "plays", "playing", "played"]', 2, 'grammar', 2),
('She likes ___ books.', '["read", "reads", "reading", "readed"]', 2, 'grammar', 2),
('They like ___ to music.', '["listen", "listens", "listening", "listened"]', 2, 'grammar', 2),
('He likes ___ pictures.', '["draw", "draws", "drawing", "drawed"]', 2, 'grammar', 2),
('We like ___ games.', '["play", "plays", "playing", "played"]', 2, 'grammar', 2),
('My sister likes ___.', '["cook", "cooks", "cooking", "cooked"]', 2, 'grammar', 2),

-- Grammar: imperatives
('"___ the door, please."', '["Opens", "Opening", "Open", "Opened"]', 2, 'grammar', 2),
('"___ sit down."', '["Not", "No", "Don''t", "Doesn''t"]', 2, 'grammar', 2),
('"___ quiet in the library."', '["Are", "Is", "Be", "Being"]', 2, 'grammar', 2),
('"___ run in the classroom!"', '["Not", "No", "Don''t", "Doesn''t"]', 2, 'grammar', 2),

-- Vocabulary: Transport
('A ___ goes on water.', '["car", "bus", "boat", "bike"]', 2, 'vocabulary', 2),
('A ___ flies in the sky.', '["bus", "train", "plane", "ship"]', 2, 'vocabulary', 2),
('A ___ runs on rails.', '["car", "bus", "train", "bike"]', 2, 'vocabulary', 2),
('You ride a ___ with two wheels.', '["car", "bus", "bike", "train"]', 2, 'vocabulary', 2),

-- Vocabulary: Places
('You buy food at the ___.', '["school", "supermarket", "hospital", "park"]', 1, 'vocabulary', 2),
('You borrow books from the ___.', '["zoo", "library", "market", "cinema"]', 1, 'vocabulary', 2),
('You see animals at the ___.', '["library", "zoo", "school", "hospital"]', 1, 'vocabulary', 2),
('You watch movies at the ___.', '["library", "park", "cinema", "school"]', 2, 'vocabulary', 2),

-- Prepositions: basic in/on/at/under/next to
('The book is ___ the table. (trên)', '["under", "in", "on", "behind"]', 2, 'prepositions', 2),
('The cat is ___ the bed. (dưới)', '["on", "in", "under", "next to"]', 2, 'prepositions', 2),
('The ball is ___ the box. (trong)', '["on", "at", "in", "under"]', 2, 'prepositions', 2),
('The dog is ___ the door. (phía sau)', '["in front of", "behind", "on", "under"]', 1, 'prepositions', 2),
('She stands ___ the house. (trước)', '["behind", "in front of", "on", "under"]', 1, 'prepositions', 2),
('The bank is ___ the school. (cạnh)', '["behind", "in", "on", "next to"]', 3, 'prepositions', 2),
('The lamp is ___ the desk. (trên)', '["under", "behind", "on", "in"]', 2, 'prepositions', 2),
('The shoes are ___ the chair. (dưới)', '["on", "under", "in", "behind"]', 1, 'prepositions', 2),
('The bird is ___ the two trees. (giữa)', '["behind", "between", "under", "on"]', 1, 'prepositions', 2),
('The clock is ___ the wall. (trên tường)', '["in", "on", "under", "at"]', 1, 'prepositions', 2),

-- Vocabulary: Actions / Verbs
('I ___ my teeth every morning.', '["wash", "brush", "comb", "clean"]', 1, 'vocabulary', 2),
('I ___ my hands before eating.', '["brush", "wash", "comb", "cut"]', 1, 'vocabulary', 2),
('I ___ my hair every day.', '["wash", "brush", "comb", "cut"]', 2, 'vocabulary', 2),

-- Vocabulary: Time
('There are ___ hours in a day.', '["12", "20", "24", "30"]', 2, 'vocabulary', 2),
('There are ___ minutes in an hour.', '["30", "45", "60", "100"]', 2, 'vocabulary', 2),
('Lunch time is usually at ___.', '["7 a.m.", "10 a.m.", "12 p.m.", "6 p.m."]', 2, 'vocabulary', 2),

-- ============================================================
-- LEVEL 3 — Pre-intermediate (present simple, articles, pronouns, wh-questions, prepositions)
-- ============================================================

-- Tenses: Present Simple (more)
('He always ___ up at 6 o''clock.', '["get", "gets", "getting", "got"]', 1, 'tenses', 3),
('My father ___ coffee every morning.', '["drink", "drinks", "drinking", "drank"]', 1, 'tenses', 3),
('She never ___ late for school.', '["is", "are", "am", "be"]', 0, 'tenses', 3),
('They always ___ their homework.', '["do", "does", "doing", "did"]', 0, 'tenses', 3),
('He ___ TV every evening.', '["watch", "watches", "watching", "watched"]', 1, 'tenses', 3),
('She ___ English and French.', '["speak", "speaks", "speaking", "spoke"]', 1, 'tenses', 3),
('My brother ___ soccer on weekends.', '["play", "plays", "playing", "played"]', 1, 'tenses', 3),
('The bus ___ at 7:30 every day.', '["leave", "leaves", "leaving", "left"]', 1, 'tenses', 3),
('She ___ her teeth twice a day.', '["brush", "brushes", "brushing", "brushed"]', 1, 'tenses', 3),
('We usually ___ lunch at noon.', '["eat", "eats", "eating", "ate"]', 0, 'tenses', 3),
('Tom ___ music very much.', '["like", "likes", "liking", "liked"]', 1, 'tenses', 3),
('I ___ to bed at 9 p.m.', '["go", "goes", "going", "went"]', 0, 'tenses', 3),
('She ___ have a pet.', '["don''t", "doesn''t", "isn''t", "aren''t"]', 1, 'tenses', 3),
('We ___ like rainy days.', '["doesn''t", "don''t", "isn''t", "aren''t"]', 1, 'tenses', 3),
('___ they play tennis?', '["Does", "Do", "Is", "Are"]', 1, 'tenses', 3),
('___ he like pizza?', '["Do", "Does", "Is", "Are"]', 1, 'tenses', 3),
('How often ___ you exercise?', '["does", "do", "is", "are"]', 1, 'tenses', 3),
('What time ___ the class start?', '["do", "does", "is", "are"]', 1, 'tenses', 3),

-- Grammar: Articles (more)
('She wants ___ egg for breakfast.', '["a", "an", "the", "—"]', 1, 'grammar', 3),
('He is ___ engineer.', '["a", "an", "the", "—"]', 1, 'grammar', 3),
('I saw ___ moon last night.', '["a", "an", "the", "—"]', 2, 'grammar', 3),
('She plays ___ violin beautifully.', '["a", "an", "the", "—"]', 2, 'grammar', 3),
('___ Earth goes around the sun.', '["A", "An", "The", "—"]', 2, 'grammar', 3),
('I need ___ water.', '["a", "an", "some", "the"]', 2, 'grammar', 3),
('There is ___ elephant in the zoo.', '["a", "an", "the", "—"]', 1, 'grammar', 3),
('She is ___ tallest girl in class.', '["a", "an", "the", "—"]', 2, 'grammar', 3),

-- Grammar: Pronouns (more)
('I love ___ mother. (của tôi)', '["I", "me", "my", "mine"]', 2, 'grammar', 3),
('He gave the ball to ___. (chúng tôi)', '["we", "us", "our", "ours"]', 1, 'grammar', 3),
('This pen is ___. (của anh ấy)', '["he", "him", "his", "her"]', 2, 'grammar', 3),
('___ are playing in the park. (Họ)', '["Them", "Their", "Theirs", "They"]', 3, 'grammar', 3),
('She washed ___ hands. (của cô ấy)', '["she", "her", "hers", "herself"]', 1, 'grammar', 3),
('The teacher told ___ to be quiet. (chúng tôi)', '["we", "us", "our", "ours"]', 1, 'grammar', 3),
('Is this book ___? (của bạn)', '["you", "your", "yours", "yourself"]', 2, 'grammar', 3),
('___ name is Tom. (Của anh ấy)', '["He", "Him", "His", "Himself"]', 2, 'grammar', 3),

-- Grammar: Wh-questions (more)
('___ is your favorite subject?', '["Who", "What", "Where", "When"]', 1, 'grammar', 3),
('___ do you go to school? — At 7 a.m.', '["What", "How", "Where", "When"]', 3, 'grammar', 3),
('___ is your teacher? — Miss Lan.', '["What", "Where", "Who", "When"]', 2, 'grammar', 3),
('___ books do you have? — Five.', '["What", "How much", "How many", "Which"]', 2, 'grammar', 3),
('___ is your school? — On Tran Hung Dao Street.', '["What", "Who", "When", "Where"]', 3, 'grammar', 3),
('___ color do you like? — Blue.', '["How", "What", "Who", "Where"]', 1, 'grammar', 3),
('___ do you go to school? — By bike.', '["What", "Where", "When", "How"]', 3, 'grammar', 3),
('___ does she feel? — She feels happy.', '["What", "Where", "How", "When"]', 2, 'grammar', 3),

-- Prepositions: time (more)
('I have English class ___ Monday.', '["in", "on", "at", "to"]', 1, 'prepositions', 3),
('We don''t go to school ___ Sunday.', '["in", "on", "at", "to"]', 1, 'prepositions', 3),
('The shop opens ___ 8 a.m.', '["in", "on", "at", "to"]', 2, 'prepositions', 3),
('I do my homework ___ the evening.', '["on", "at", "in", "to"]', 2, 'prepositions', 3),
('She was born ___ March 5th.', '["in", "on", "at", "to"]', 1, 'prepositions', 3),
('We eat lunch ___ noon.', '["in", "on", "at", "to"]', 2, 'prepositions', 3),
('They play games ___ the afternoon.', '["on", "at", "in", "to"]', 2, 'prepositions', 3),
('School finishes ___ 4:30 p.m.', '["in", "on", "at", "to"]', 2, 'prepositions', 3),
('I always wake up ___ 6 o''clock.', '["in", "on", "at", "to"]', 2, 'prepositions', 3),
('We have a holiday ___ December.', '["on", "at", "in", "to"]', 2, 'prepositions', 3),

-- Prepositions: place (more)
('She lives ___ 10 Le Loi Street.', '["in", "on", "at", "to"]', 2, 'prepositions', 3),
('There is a garden ___ the school.', '["behind", "under", "on", "at"]', 0, 'prepositions', 3),
('The shop is ___ the bank and the school.', '["behind", "next to", "between", "under"]', 2, 'prepositions', 3),
('He is sitting ___ the chair.', '["at", "in", "on", "under"]', 2, 'prepositions', 3),
('The pharmacy is ___ the post office.', '["in", "on", "next to", "under"]', 2, 'prepositions', 3),
('She is standing ___ the bus stop.', '["in", "on", "at", "under"]', 2, 'prepositions', 3),

-- Grammar: some / any
('Is there ___ milk in the fridge?', '["some", "any", "a", "many"]', 1, 'grammar', 3),
('I have ___ friends at school.', '["any", "some", "a", "much"]', 1, 'grammar', 3),
('There aren''t ___ eggs left.', '["some", "any", "a", "much"]', 1, 'grammar', 3),
('Can I have ___ water, please?', '["any", "some", "a", "many"]', 1, 'grammar', 3),
('She doesn''t have ___ brothers.', '["some", "any", "a", "much"]', 1, 'grammar', 3),
('There are ___ flowers in the garden.', '["any", "some", "a", "much"]', 1, 'grammar', 3),

-- Grammar: a lot of / lots of
('She has ___ toys.', '["a lot of", "much", "any", "a"]', 0, 'grammar', 3),
('There is ___ sugar in the tea.', '["many", "a lot of", "few", "any"]', 1, 'grammar', 3),

-- Vocabulary: Adjectives
('The elephant is ___, but the mouse is small.', '["short", "thin", "big", "fast"]', 2, 'vocabulary', 3),
('Ice is ___, but fire is hot.', '["warm", "cool", "cold", "wet"]', 2, 'vocabulary', 3),
('A snail is ___, but a cheetah is fast.', '["big", "slow", "small", "quick"]', 1, 'vocabulary', 3),
('The giraffe is ___, but the pig is short.', '["tall", "long", "big", "fat"]', 0, 'vocabulary', 3),
('This box is ___, but that one is light.', '["big", "small", "heavy", "thin"]', 2, 'vocabulary', 3),
('The road is ___, but the path is short.', '["wide", "narrow", "long", "tall"]', 2, 'vocabulary', 3),

-- ============================================================
-- LEVEL 4 — Intermediate (tenses, modals, comparatives, conjunctions, prepositions)
-- ============================================================

-- Tenses: Present Continuous (more)
('She ___ a letter right now.', '["writes", "write", "is writing", "wrote"]', 2, 'tenses', 4),
('The children ___ in the park now.', '["play", "plays", "are playing", "played"]', 2, 'tenses', 4),
('I ___ dinner at the moment.', '["cook", "cooks", "am cooking", "cooked"]', 2, 'tenses', 4),
('Mom ___ on the phone now.', '["talk", "talks", "is talking", "talked"]', 2, 'tenses', 4),
('They ___ for the bus right now.', '["wait", "waits", "are waiting", "waited"]', 2, 'tenses', 4),
('He ___ his room now.', '["clean", "cleans", "is cleaning", "cleaned"]', 2, 'tenses', 4),
('We ___ English now.', '["study", "studies", "are studying", "studied"]', 2, 'tenses', 4),
('The birds ___ in the trees.', '["sing", "sings", "are singing", "sang"]', 2, 'tenses', 4),

-- Tenses: Past Simple (more)
('She ___ the window yesterday.', '["open", "opens", "is opening", "opened"]', 3, 'tenses', 4),
('We ___ to the beach last summer.', '["go", "goes", "went", "going"]', 2, 'tenses', 4),
('He ___ his phone last night.', '["lose", "loses", "losing", "lost"]', 3, 'tenses', 4),
('They ___ a new car last year.', '["buy", "buys", "bought", "buying"]', 2, 'tenses', 4),
('She ___ a letter to her friend.', '["write", "writes", "writing", "wrote"]', 3, 'tenses', 4),
('I ___ a strange noise last night.', '["hear", "hears", "hearing", "heard"]', 3, 'tenses', 4),
('He ___ the answer to the question.', '["know", "knows", "knowing", "knew"]', 3, 'tenses', 4),
('We ___ pizza for dinner yesterday.', '["eat", "eats", "eating", "ate"]', 3, 'tenses', 4),
('She ___ to school by bus yesterday.', '["go", "goes", "going", "went"]', 3, 'tenses', 4),
('They ___ home at 5 p.m. yesterday.', '["come", "comes", "came", "coming"]', 2, 'tenses', 4),
('___ you go to the party last night?', '["Do", "Did", "Does", "Are"]', 1, 'tenses', 4),
('He ___ eat breakfast this morning.', '["don''t", "doesn''t", "didn''t", "isn''t"]', 2, 'tenses', 4),

-- Tenses: Future Simple (more)
('We ___ visit our grandparents next week.', '["are", "were", "will", "did"]', 2, 'tenses', 4),
('She ___ be a doctor in the future.', '["is", "was", "will", "does"]', 2, 'tenses', 4),
('I think it ___ be sunny tomorrow.', '["is", "was", "will", "does"]', 2, 'tenses', 4),
('They ___ go camping next month.', '["are", "were", "will", "did"]', 2, 'tenses', 4),
('He ___ not come to school tomorrow.', '["does", "did", "will", "is"]', 2, 'tenses', 4),
('___ you help me with this?', '["Do", "Did", "Will", "Are"]', 2, 'tenses', 4),
('I ___ buy a new phone next month.', '["am", "was", "will", "do"]', 2, 'tenses', 4),
('We ___ have a test next Friday.', '["are", "were", "will", "do"]', 2, 'tenses', 4),

-- Grammar: Modals (more)
('You ___ wear a helmet when cycling.', '["can", "may", "must", "could"]', 2, 'grammar', 4),
('Students ___ be quiet in the library.', '["can", "may", "must", "could"]', 2, 'grammar', 4),
('___ I use your phone?', '["Must", "Should", "May", "Will"]', 2, 'grammar', 4),
('She ___ be at the park. I saw her bike there.', '["must", "should", "might", "can"]', 0, 'grammar', 4),
('You ___ eat more vegetables.', '["must", "should", "might", "can"]', 1, 'grammar', 4),
('He ___ play the piano when he was 6.', '["can", "could", "may", "must"]', 1, 'grammar', 4),
('You ___ not use your phone in class.', '["can", "may", "must", "could"]', 2, 'grammar', 4),
('It ___ rain later. Take an umbrella.', '["must", "should", "might", "will"]', 2, 'grammar', 4),
('We ___ respect our teachers.', '["can", "may", "should", "might"]', 2, 'grammar', 4),
('She ___ run very fast when she was young.', '["can", "could", "may", "must"]', 1, 'grammar', 4),

-- Grammar: Conjunctions (more)
('I was hungry ___ I ate a sandwich.', '["but", "or", "so", "because"]', 2, 'grammar', 4),
('She likes cats ___ dogs.', '["but", "and", "or", "so"]', 1, 'grammar', 4),
('Do you want tea ___ coffee?', '["and", "but", "or", "so"]', 2, 'grammar', 4),
('He studied hard ___ he failed the test.', '["and", "but", "or", "so"]', 1, 'grammar', 4),
('I can''t go out ___ it is raining.', '["so", "but", "and", "because"]', 3, 'grammar', 4),
('She was tired ___ she kept working.', '["and", "but", "or", "so"]', 1, 'grammar', 4),
('We stayed home ___ the weather was bad.', '["so", "and", "or", "because"]', 3, 'grammar', 4),
('Hurry up ___ you will be late!', '["and", "but", "or", "because"]', 2, 'grammar', 4),
('He is smart ___ lazy.', '["and", "or", "so", "but"]', 3, 'grammar', 4),
('I brought an umbrella ___ it didn''t rain.', '["and", "so", "but", "because"]', 2, 'grammar', 4),

-- Grammar: Comparatives & Superlatives (more)
('A car is ___ than a bicycle.', '["fast", "faster", "fastest", "more fast"]', 1, 'grammar', 4),
('An elephant is ___ than a cat.', '["heavy", "heavier", "heaviest", "more heavy"]', 1, 'grammar', 4),
('This is the ___ movie I have ever seen.', '["good", "better", "best", "more good"]', 2, 'grammar', 4),
('Today is ___ than yesterday.', '["hot", "hotter", "hottest", "more hot"]', 1, 'grammar', 4),
('She is the ___ runner in the team.', '["fast", "faster", "fastest", "more fast"]', 2, 'grammar', 4),
('This problem is ___ than the last one.', '["easy", "easier", "easiest", "more easy"]', 1, 'grammar', 4),
('He is the ___ boy in our class.', '["friendly", "friendlier", "friendliest", "more friendly"]', 2, 'grammar', 4),
('Math is ___ than English for me.', '["hard", "harder", "hardest", "more hard"]', 1, 'grammar', 4),
('This book is ___ than that one.', '["interesting", "interestinger", "more interesting", "most interesting"]', 2, 'grammar', 4),
('She sings ___ than her sister.', '["good", "better", "best", "more good"]', 1, 'grammar', 4),
('This is the ___ building in the city.', '["tall", "taller", "tallest", "more tall"]', 2, 'grammar', 4),
('A plane is ___ than a train.', '["fast", "faster", "fastest", "more fast"]', 1, 'grammar', 4),

-- Grammar: much / many / a few / a little (more)
('She has ___ friends at school.', '["much", "a few", "a little", "any"]', 1, 'grammar', 4),
('There is ___ sugar in my tea.', '["many", "few", "a little", "a few"]', 2, 'grammar', 4),
('How ___ students are in your class?', '["much", "many", "little", "a lot"]', 1, 'grammar', 4),
('I have ___ homework tonight.', '["many", "a few", "a lot of", "few"]', 2, 'grammar', 4),
('There aren''t ___ oranges left.', '["much", "many", "a little", "a lot"]', 1, 'grammar', 4),
('We need ___ flour to make the cake.', '["many", "a few", "some", "few"]', 2, 'grammar', 4),

-- Prepositions: verb + preposition (more)
('She is looking ___ her keys.', '["at", "for", "on", "in"]', 1, 'prepositions', 4),
('I agree ___ you.', '["to", "for", "with", "on"]', 2, 'prepositions', 4),
('He is thinking ___ the problem.', '["at", "for", "in", "about"]', 3, 'prepositions', 4),
('She apologized ___ being late.', '["at", "for", "to", "with"]', 1, 'prepositions', 4),
('They are talking ___ the movie.', '["at", "for", "in", "about"]', 3, 'prepositions', 4),
('I am proud ___ my son.', '["at", "for", "of", "with"]', 2, 'prepositions', 4),
('She is tired ___ waiting.', '["at", "for", "of", "with"]', 2, 'prepositions', 4),
('He is responsible ___ this project.', '["at", "for", "of", "with"]', 1, 'prepositions', 4),
('We are worried ___ the exam.', '["at", "for", "of", "about"]', 3, 'prepositions', 4),
('She is fond ___ chocolate.', '["at", "for", "of", "with"]', 2, 'prepositions', 4),
('He is used ___ waking up early.', '["at", "for", "to", "with"]', 2, 'prepositions', 4),
('The teacher is pleased ___ our work.', '["at", "for", "of", "with"]', 3, 'prepositions', 4),
('I am keen ___ learning new things.', '["at", "for", "on", "with"]', 2, 'prepositions', 4),
('She succeeded ___ passing the test.', '["at", "for", "on", "in"]', 3, 'prepositions', 4),
('He insisted ___ paying the bill.', '["at", "for", "on", "in"]', 2, 'prepositions', 4),
('We are looking forward ___ the trip.', '["at", "for", "on", "to"]', 3, 'prepositions', 4),

-- Grammar: Present Simple vs Present Continuous
('She ___ to work every day. (habit)', '["is going", "goes", "go", "going"]', 1, 'grammar', 4),
('Look! The baby ___. (now)', '["cries", "cry", "is crying", "cried"]', 2, 'grammar', 4),
('He usually ___ tea, but today he ___ coffee.', '["drinks / is drinking", "is drinking / drinks", "drink / drinks", "drank / drinks"]', 0, 'grammar', 4),
('I ___ English every Tuesday.', '["am studying", "study", "studies", "studying"]', 1, 'grammar', 4),
('Listen! Someone ___ at the door.', '["knock", "knocks", "is knocking", "knocked"]', 2, 'grammar', 4),
('They ___ tennis every weekend.', '["are playing", "play", "plays", "playing"]', 1, 'grammar', 4),
('Shh! The teacher ___.', '["talk", "talks", "is talking", "talked"]', 2, 'grammar', 4),
('Water ___ at 100 degrees.', '["is boiling", "boils", "boil", "boiling"]', 1, 'grammar', 4),

-- Vocabulary: Feelings & Emotions
('When you win a game, you feel ___.', '["sad", "angry", "happy", "scared"]', 2, 'vocabulary', 4),
('When you lose your toy, you feel ___.', '["happy", "sad", "excited", "bored"]', 1, 'vocabulary', 4),
('Before a big test, you might feel ___.', '["relaxed", "bored", "nervous", "sleepy"]', 2, 'vocabulary', 4),
('When someone is mean to you, you feel ___.', '["happy", "excited", "proud", "upset"]', 3, 'vocabulary', 4),
('After running a long race, you feel ___.', '["bored", "tired", "angry", "scared"]', 1, 'vocabulary', 4),
('When you get a surprise gift, you feel ___.', '["bored", "angry", "surprised", "tired"]', 2, 'vocabulary', 4),

-- Reading comprehension style
('"He wakes up at 6, eats breakfast at 7, and goes to school at 7:30." What does he do first?', '["Go to school", "Eat breakfast", "Wake up", "Do homework"]', 2, 'reading', 4),
('"She has a cat named Mimi. Mimi is white and small." What color is Mimi?', '["Black", "Brown", "White", "Gray"]', 2, 'reading', 4),
('"Tom lives in Hanoi. He is 10 years old." How old is Tom?', '["8", "9", "10", "11"]', 2, 'reading', 4),
('"It is raining. She takes an umbrella." Why does she take an umbrella?', '["It is sunny", "It is windy", "It is raining", "It is snowing"]', 2, 'reading', 4),
('"The store opens at 8 a.m. and closes at 9 p.m." When does it close?', '["8 a.m.", "8 p.m.", "9 a.m.", "9 p.m."]', 3, 'reading', 4),
('"Anna likes apples but doesn''t like bananas." What fruit does Anna like?', '["Bananas", "Apples", "Oranges", "Grapes"]', 1, 'reading', 4),

-- Vocabulary: Common phrases
('"Excuse me" is used when you want to ___.', '["say sorry", "get attention", "say goodbye", "say thanks"]', 1, 'vocabulary', 4),
('"I''m sorry" is used when you ___.', '["are happy", "made a mistake", "want food", "are bored"]', 1, 'vocabulary', 4),
('"How are you?" — "I''m ___, thank you."', '["fine", "sorry", "welcome", "please"]', 0, 'vocabulary', 4),
('"See you later" means ___.', '["hello", "sorry", "goodbye for now", "thank you"]', 2, 'vocabulary', 4);
