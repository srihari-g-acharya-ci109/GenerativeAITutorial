// Curated beginner Java lessons and interactive challenges
export const LESSONS = [
  {
    id: 'lesson-1',
    title: '1. Hello, Java! & Structure',
    difficulty: 'Absolute Beginner',
    summary: 'Understand the anatomy of a Java program, the main method, and how to print to the screen.',
    explanation: `
Every Java program starts with a **Class** and a **main method**.

- \`public class Main\`: A class is a container for your code.
- \`public static void main(String[] args)\`: This is the **entry point** where Java starts running.
- \`System.out.println(...)\`: Prints a line of text to your console and moves to the next line.
- Semicolons (\`;\`): In Java, every standalone instruction must end with a semicolon!
    `,
    starterCode: `public class Main {
    public static void main(String[] args) {
        // Welcome to your first Java program!
        System.out.println("Hello, World!");
        System.out.println("I am learning Java with DukeAI! 🚀");
        
        // Try changing the message or adding your own print statement below:
        
    }
}`,
    expectedOutput: `Hello, World!\nI am learning Java with DukeAI! 🚀`,
    challenge: 'Add a third print statement that outputs your favorite hobby or coding goal.'
  },
  {
    id: 'lesson-2',
    title: '2. Variables & Data Types',
    difficulty: 'Beginner',
    summary: 'Learn how to store numbers, text, and true/false values in memory.',
    explanation: `
Java is **statically typed** — you must declare what kind of data each variable holds before storing it:

- \`int\`: Whole numbers (e.g. 42, -5)
- \`double\`: Decimals (e.g. 3.14, 99.99)
- \`boolean\`: Either \`true\` or \`false\`
- \`char\`: Single character inside single quotes \`'A'\`
- \`String\`: Text inside double quotes \`"Java"\`
    `,
    starterCode: `public class Main {
    public static void main(String[] args) {
        // Declaring variables
        String studentName = "Maya";
        int age = 19;
        double currentGPA = 3.92;
        char letterGrade = 'A';
        boolean isEnrolled = true;

        // String concatenation with '+'
        System.out.println("Student Profile:");
        System.out.println("Name: " + studentName);
        System.out.println("Age: " + age + " years old");
        System.out.println("GPA: " + currentGPA + " (Grade: " + letterGrade + ")");
        System.out.println("Active Enrollment: " + isEnrolled);
    }
}`,
    expectedOutput: `Student Profile:\nName: Maya\nAge: 19 years old\nGPA: 3.92 (Grade: A)\nActive Enrollment: true`,
    challenge: 'Declare an int variable called birthYear and calculate studentName\'s age in 2030.'
  },
  {
    id: 'lesson-3',
    title: '3. Reading Input with Scanner',
    difficulty: 'Beginner',
    summary: 'Interact with users by reading text and numbers from the console keyboard.',
    explanation: `
To receive input, we import and use Java's \`Scanner\` utility:

1. \`import java.util.Scanner;\` at the very top of the file.
2. Create the scanner: \`Scanner scanner = new Scanner(System.in);\`.
3. Read data:
   - \`scanner.nextLine()\` reads a line of text.
   - \`scanner.nextInt()\` reads an integer.
   - \`scanner.nextDouble()\` reads a decimal number.
    `,
    starterCode: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // Open the Stdin drawer in the terminal below to provide input!
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter your hero name: ");
        String heroName = scanner.hasNextLine() ? scanner.nextLine() : "Knight";

        System.out.print("Enter your power level (1-100): ");
        int power = scanner.hasNextInt() ? scanner.nextInt() : 85;

        System.out.println("\n--- Hero Created ---");
        System.out.println("Welcome, " + heroName + "!");
        System.out.println("Combat Power: " + power);

        scanner.close();
    }
}`,
    defaultStdin: `Aria\n99`,
    expectedOutput: `Enter your hero name: Enter your power level (1-100): \n--- Hero Created ---\nWelcome, Aria!\nCombat Power: 99`,
    challenge: 'Prompt for the hero\'s favorite weapon (String) and print it out in the summary.'
  },
  {
    id: 'lesson-4',
    title: '4. Conditionals (If, Else If, Else)',
    difficulty: 'Beginner',
    summary: 'Teach your program to make decisions based on comparisons and conditions.',
    explanation: `
Conditionals allow your code to take different paths:

- Comparison operators: \`>\`, \`<\`, \`>=\`, \`<=\`, \`==\` (equal), \`!=\` (not equal)
- Logical operators: \`&&\` (AND), \`||\` (OR), \`!\` (NOT)
- Structure:
  \`if (condition) { ... } else if (otherCondition) { ... } else { ... }\`
    `,
    starterCode: `public class Main {
    public static void main(String[] args) {
        int score = 88;

        System.out.println("Exam Score: " + score);

        if (score >= 90) {
            System.out.println("Letter Grade: A - Outstanding work! 🌟");
        } else if (score >= 80) {
            System.out.println("Letter Grade: B - Great job! 👍");
        } else if (score >= 70) {
            System.out.println("Letter Grade: C - Good effort. Keep practicing!");
        } else {
            System.out.println("Letter Grade: Needs improvement. DukeAI is here to help!");
        }
    }
}`,
    expectedOutput: `Exam Score: 88\nLetter Grade: B - Great job! 👍`,
    challenge: 'Add a check: if the score is exactly 100, print "PERFECT SCORE! 🏆".'
  },
  {
    id: 'lesson-5',
    title: '5. Switch Statements',
    difficulty: 'Beginner',
    summary: 'Cleanly branch between many exact values without nesting dozens of if-statements.',
    explanation: `
When comparing a single variable against many fixed values (like days of the week or menu choices), a \`switch\` statement is much cleaner than multiple \`if\` statements.

Remember to include \`break;\` after each case so execution doesn't fall through!
    `,
    starterCode: `public class Main {
    public static void main(String[] args) {
        int dayOfWeek = 3; // 1 = Monday, 2 = Tuesday, ...

        String dayName;
        switch (dayOfWeek) {
            case 1:
                dayName = "Monday - Start of the week!";
                break;
            case 2:
                dayName = "Tuesday - Getting into the groove.";
                break;
            case 3:
                dayName = "Wednesday - Midweek peak!";
                break;
            case 4:
                dayName = "Thursday - Almost the weekend.";
                break;
            case 5:
                dayName = "Friday - Weekend is here! 🎉";
                break;
            default:
                dayName = "Weekend! Rest & recharge.";
                break;
        }

        System.out.println("Today is: " + dayName);
    }
}`,
    expectedOutput: `Today is: Wednesday - Midweek peak!`,
    challenge: 'Change dayOfWeek to 5 and observe the output, or add cases for Saturday and Sunday.'
  },
  {
    id: 'lesson-6',
    title: '6. Loops (While & Do-While)',
    difficulty: 'Beginner',
    summary: 'Repeat tasks dynamically while a condition remains true.',
    explanation: `
A **while loop** checks the condition BEFORE running the code block.
A **do-while loop** runs the code block AT LEAST ONCE before checking the condition.

⚠️ Always ensure your loop variable changes inside the loop, otherwise you will cause an **infinite loop**!
    `,
    starterCode: `public class Main {
    public static void main(String[] args) {
        System.out.println("--- While Loop: Rocket Countdown ---");
        int countdown = 5;

        while (countdown > 0) {
            System.out.println("T-minus " + countdown + "...");
            countdown--; // Decrement counter
        }
        System.out.println("Ignition! Liftoff! 🚀\n");

        System.out.println("--- Do-While Loop: Dice Rolling ---");
        int roll = 0;
        int attempts = 0;
        do {
            attempts++;
            // Simulating dice roll between 1 and 6
            roll = (attempts * 3) % 6 + 1;
            System.out.println("Attempt " + attempts + ": Rolled a " + roll);
        } while (roll != 6 && attempts < 4);

        System.out.println("Finished rolling!");
    }
}`,
    expectedOutput: `--- While Loop: Rocket Countdown ---\nT-minus 5...\nT-minus 4...\nT-minus 3...\nT-minus 2...\nT-minus 1...\nIgnition! Liftoff! 🚀\n\n--- Do-While Loop: Dice Rolling ---\nAttempt 1: Rolled a 4\nAttempt 2: Rolled a 1\nAttempt 3: Rolled a 4\nAttempt 4: Rolled a 1\nFinished rolling!`,
    challenge: 'Modify the countdown loop to count down by 2s instead of 1s.'
  },
  {
    id: 'lesson-7',
    title: '7. For Loops & Patterns',
    difficulty: 'Beginner',
    summary: 'Counted iteration and nested loops for building grids and patterns.',
    explanation: `
The **for loop** packs initialization, condition, and increment into one concise line:
\`for (int i = 0; i < count; i++) { ... }\`

Nested loops (a loop inside another loop) are great for 2D grids, tables, and patterns!
    `,
    starterCode: `public class Main {
    public static void main(String[] args) {
        System.out.println("--- Multiples of 3 ---");
        for (int i = 1; i <= 5; i++) {
            System.out.println("3 x " + i + " = " + (3 * i));
        }

        System.out.println("\n--- Star Pyramid Pattern ---");
        int rows = 5;
        for (int row = 1; row <= rows; row++) {
            // Print stars for current row
            for (int star = 1; star <= row; star++) {
                System.out.print("⭐ ");
            }
            // Move to next line
            System.out.println();
        }
    }
}`,
    expectedOutput: `--- Multiples of 3 ---\n3 x 1 = 3\n3 x 2 = 6\n3 x 3 = 9\n3 x 4 = 12\n3 x 5 = 15\n\n--- Star Pyramid Pattern ---\n⭐ \n⭐ ⭐ \n⭐ ⭐ ⭐ \n⭐ ⭐ ⭐ ⭐ \n⭐ ⭐ ⭐ ⭐ ⭐ `,
    challenge: 'Try printing the star pattern upside down starting with 5 stars down to 1 star!'
  },
  {
    id: 'lesson-8',
    title: '8. Arrays & For-Each Loop',
    difficulty: 'Intermediate Beginner',
    summary: 'Store ordered collections of elements and iterate through them efficiently.',
    explanation: `
An **Array** holds multiple values of the exact same type with a fixed size:
- Declaring: \`int[] numbers = {10, 20, 30};\`.
- 0-Indexed: The first element is at \`numbers[0]\`.
- Length: \`numbers.length\` gives the total number of items.
- Enhanced For-Each loop: \`for (int num : numbers) { ... }\` makes scanning arrays effortless.
    `,
    starterCode: `public class Main {
    public static void main(String[] args) {
        // Array of high scores
        int[] scores = { 95, 82, 100, 74, 91 };

        System.out.println("Total players: " + scores.length);
        System.out.println("First player score: " + scores[0]);

        // Calculate sum and average
        int sum = 0;
        int highest = scores[0];

        // For-each loop
        for (int score : scores) {
            sum += score;
            if (score > highest) {
                highest = score;
            }
        }

        double average = (double) sum / scores.length;

        System.out.println("Class Total: " + sum);
        System.out.println("Average Score: " + average);
        System.out.println("Highest Score: " + highest);
    }
}`,
    expectedOutput: `Total players: 5\nFirst player score: 95\nClass Total: 442\nAverage Score: 88.4\nHighest Score: 100`,
    challenge: 'Add a search to find and print the lowest score in the array.'
  },
  {
    id: 'lesson-9',
    title: '9. Methods & Functions',
    difficulty: 'Intermediate Beginner',
    summary: 'Organize code into reusable, modular blocks with parameters and return types.',
    explanation: `
**Methods** are functions that perform a specific task. They keep your code DRY (Don't Repeat Yourself!).

- \`static\`: Belongs to the class (can be called from \`main\` without creating an object).
- Return type: \`void\` means returns nothing; otherwise specify \`int\`, \`double\`, \`String\`, etc.
- Parameters: Variables passed into the method.
    `,
    starterCode: `public class Main {
    // 1. A method that calculates and returns a value
    public static double calculateTip(double billAmount, double tipPercent) {
        return billAmount * (tipPercent / 100.0);
    }

    // 2. A void method that performs an action (prints a receipt)
    public static void printReceipt(String item, double price, double tip) {
        System.out.println("================================");
        System.out.println("Item: " + item);
        System.out.println("Base Price: $" + price);
        System.out.println("Tip:        $" + tip);
        System.out.println("Total:      $" + (price + tip));
        System.out.println("================================");
    }

    public static void main(String[] args) {
        double bill = 45.50;
        double tip = calculateTip(bill, 18.0); // 18% tip

        printReceipt("Gourmet Burger & Fries", bill, tip);
    }
}`,
    expectedOutput: `================================\nItem: Gourmet Burger & Fries\nBase Price: $45.5\nTip:        $8.19\nTotal:      $53.69\n================================`,
    challenge: 'Create a method called celsiusToFahrenheit(double celsius) that returns the Fahrenheit temperature.'
  },
  {
    id: 'lesson-10',
    title: '10. OOP: Classes & Objects',
    difficulty: 'Intermediate Beginner',
    summary: 'The heart of Java: modeling real-world entities with classes, constructors, and methods.',
    explanation: `
**Object-Oriented Programming (OOP)** is how real-world software is structured:

1. **Class (Blueprint)**: Defines attributes (data) and behaviors (methods).
2. **Constructor**: Special method called when creating an object using the \`new\` keyword.
3. **Instance**: A unique, live object created from the blueprint.
    `,
    starterCode: `// 1. The Blueprint (Class)
class Car {
    // Attributes (Fields)
    String brand;
    String model;
    int speed;

    // Constructor
    public Car(String brandName, String modelName) {
        brand = brandName;
        model = modelName;
        speed = 0; // Starts parked
    }

    // Behavior (Method)
    public void accelerate(int mph) {
        speed += mph;
        System.out.println(brand + " " + model + " accelerated to " + speed + " mph!");
    }

    public void brake() {
        speed = 0;
        System.out.println(brand + " " + model + " came to a full stop.");
    }
}

public class Main {
    public static void main(String[] args) {
        // Creating two independent Car objects:
        Car car1 = new Car("Tesla", "Model 3");
        Car car2 = new Car("Ford", "Mustang");

        car1.accelerate(45);
        car2.accelerate(60);

        car1.brake();
        System.out.println("Car 2 is still cruising at " + car2.speed + " mph!");
    }
}`,
    expectedOutput: `Tesla Model 3 accelerated to 45 mph!\nFord Mustang accelerated to 60 mph!\nTesla Model 3 came to a full stop.\nCar 2 is still cruising at 60 mph!`,
    challenge: 'Add a new method `honk()` to the Car class that prints "Beep beep!" with the car\'s model name.'
  }
];
