// ============================================================================
// DATA STRUCTURE - SINGLE SOURCE OF TRUTH
// ============================================================================

const books = {
        "Dhalgren": {
                "author": "Delany",
                "tier": 1,
                "source": "original",
                "is_unlimited": true,
                "tiles": {
                        "queer protagonist": true,
                        "multiple POVs": true,
                        "unreliable narrator": true,
                        "breaks 4th wall": true,
                        "interactive/nonlinear": true,
                        "banned book": true,
                        "contextually social taboo": true,
                        "cliche/foundational": true,
                        "dialectics": false
                }
        },

        "The Glass Bead Game": {
                "author": "Hesse",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "book about sports/game": true,
                        "cliche/foundational": true,
                        "interactive/nonlinear": true,
                        "translated": false
                }
        },

        "The Name of the Rose": {
                "author": "Eco",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "espionage/intelligence": true,
                        "architecture history": true,
                        "made into movie": false,
                        "translated": false,
                        "main character older than 50": false
                }
        },

        "2666": {
                "author": "Bolaño",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "1000+ pages": true,
                        "main character older than 50": true,
                        "contextually social taboo": false,
                        "multiple POVs": false,
                        "translated": false,
                        "based on true story": false
                }
        },

        "Hopscotch": {
                "author": "Cortázar",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "translated": true,
                        "interactive/nonlinear": true,
                        "unreliable narrator": true,
                        "multiple POVs": false,
                        "breaks 4th wall": false
                }
        },

        "Life: A User's Manual": {
                "author": "Perec",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "multiple POVs": true,
                        "interactive/nonlinear": true,
                        "breaks 4th wall": true,
                        "translated": false
                }
        },

        "Borges Collected Fictions": {
                "author": "Borges",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "translated": true,
                        "unreliable narrator": true,
                        "cliche/foundational": true,
                        "multiple POVs": false,
                        "breaks 4th wall": false,
                        "interactive/nonlinear": false,
                        "dialectics": false
                }
        },

        "Austerlitz": {
                "author": "Sebald",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "nonfiction travelogue": true,
                        "main character older than 50": true,
                        "based on true story": true,
                        "architecture history": false,
                        "translated": false
                }
        },

        "Maus": {
                "author": "Spiegelman",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "graphic novel": true,
                        "anthropomorphic protagonist": true,
                        "based on true story": true,
                        "biography/autobiography": false,
                        "banned book": false,
                        "made into movie": false
                }
        },

        "The God of Small Things": {
                "author": "Roy",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "Indian author": true,
                        "political ideology": true,
                        "banned book": true,
                        "multiple POVs": false,
                        "contextually social taboo": false,
                        "made into movie": false
                }
        },

        "Midnight's Children": {
                "author": "Rushdie",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "Indian author": true,
                        "multiple POVs": true,
                        "made into movie": true,
                        "unreliable narrator": false,
                        "political ideology": false,
                        "banned book": false,
                        "cliche/foundational": false,
                        "based on true story": false
                }
        },

        "The Rings of Saturn": {
                "author": "Sebald",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "nonfiction nature": true,
                        "translated": true,
                        "architecture history": true,
                        "nonfiction travelogue": false,
                        "main character older than 50": false
                }
        },

        "Camera Lucida": {
                "author": "Barthes",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "nonfiction on a hobby": true,
                        "nonfiction nature": true,
                        "biography/autobiography": true,
                        "translated": false
                }
        },

        "Citizen": {
                "author": "Rankine",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "poetry by person of color": true,
                        "biography/autobiography": true,
                        "American history": true,
                        "contextually social taboo": false,
                        "breaks 4th wall": false
                }
        },

        "The Fifth Season": {
                "author": "Jemisin",
                "tier": 1,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "fantasy inspired by non-western culture": true,
                        "well-behaved women": true,
                        "dissident movements": true,
                        "multiple POVs": false,
                        "banned book": false,
                        "cliche/foundational": false,
                        "dialectics": false
                }
        },

        "If on a winter's night a traveler": {
                "author": "Calvino",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "already own but haven't read": true,
                        "translated": true,
                        "breaks 4th wall": true,
                        "unreliable narrator": false,
                        "interactive/nonlinear": false,
                        "multiple POVs": false,
                        "dialectics": false
                }
        },

        "Fifth Head of Cerberus": {
                "author": "Wolfe",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "part of a series": true,
                        "anthropomorphic protagonist": true,
                        "multiple POVs": true,
                        "unreliable narrator": false,
                        "interactive/nonlinear": false,
                        "cliche/foundational": false,
                        "dialectics": false
                }
        },

        "Urth of the New Sun": {
                "author": "Wolfe",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "part of a series": true,
                        "time travel": true,
                        "cliche/foundational": true,
                        "unreliable narrator": false,
                        "main character older than 50": false
                }
        },

        "Ulysses": {
                "author": "Joyce",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "24 hours": true,
                        "cliche/foundational": true,
                        "breaks 4th wall": true,
                        "multiple POVs": false,
                        "made into movie": false
                }
        },

        "The Crying of Lot 49": {
                "author": "Pynchon",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "dialectics": true,
                        "espionage/intelligence": true,
                        "American history": true,
                        "unreliable narrator": false,
                        "dissident movements": false,
                        "breaks 4th wall": false
                }
        },

        "Pale Fire": {
                "author": "Nabokov",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "dialectics": true,
                        "unreliable narrator": true,
                        "breaks 4th wall": true,
                        "multiple POVs": false,
                        "translated": false,
                        "cliche/foundational": false
                }
        },

        "Beloved": {
                "author": "Morrison",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "banned book": true,
                        "American history": true,
                        "well-behaved women": true,
                        "multiple POVs": false,
                        "unreliable narrator": false,
                        "anthropomorphic protagonist": false,
                        "based on true story": false
                }
        },

        "Kindred": {
                "author": "Butler",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "time travel": true,
                        "American history": true,
                        "well-behaved women": true,
                        "contextually social taboo": false,
                        "banned book": false
                }
        },

        "The Motion of Light in Water": {
                "author": "Delany",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "queer nonfiction": true,
                        "biography/autobiography": true,
                        "dissident movements": true,
                        "American history": false,
                        "contextually social taboo": false
                }
        },

        "Death and Life of Great American Cities": {
                "author": "Jacobs",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "architecture history": true,
                        "well-behaved women": true,
                        "political ideology": true,
                        "American history": false
                }
        },

        "Parable of the Sower": {
                "author": "Butler",
                "tier": 2,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "reread a book you didn't finish": true,
                        "dissident movements": true,
                        "well-behaved women": true,
                        "American history": false,
                        "contextually social taboo": false
                }
        },

        "House of Leaves": {
                "author": "Danielewski",
                "tier": 2,
                "source": "wishlist",
                "is_unlimited": false,
                "tiles": {
                        "dialectics": true,
                        "interactive/nonlinear": true,
                        "multiple POVs": true,
                        "breaks 4th wall": false,
                        "unreliable narrator": false
                }
        },

        "Slaughterhouse-Five": {
                "author": "Vonnegut",
                "tier": 3,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "time travel": true,
                        "made into movie": true,
                        "cliche/foundational": true,
                        "American history": false
                }
        },

        "The English Patient": {
                "author": "Ondaatje",
                "tier": 4,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "published in 1992": true,
                        "based on true story": true,
                        "made into movie": true,
                        "multiple POVs": false,
                        "main character older than 50": false
                }
        },

        "The Little Prince": {
                "author": "Saint-Exupéry",
                "tier": 4,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "children's book": true,
                        "under 100 pages": true,
                        "translated": true,
                        "made into movie": false
                }
        },

        "Much Ado About Nothing": {
                "author": "Shakespeare",
                "tier": 4,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "Shakespeare play": true,
                        "enemies to lovers": true,
                        "made into movie": true
                }
        },

        "The Folding Star": {
                "author": "Hollinghurst",
                "tier": 4,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "smut/romantasy": true,
                        "queer protagonist": true,
                        "unreliable narrator": true,
                        "translated": false,
                        "contextually social taboo": false
                }
        },

        "A Passage to India": {
                "author": "Forster",
                "tier": 4,
                "source": "original",
                "is_unlimited": false,
                "tiles": {
                        "based in India pre-partition": true,
                        "political ideology": true,
                        "contextually social taboo": true,
                        "main character older than 50": false,
                        "made into movie": false
                }
        }
};

const dialecticsPairs = {
        "Dhalgren": { pair: "The City & The City", inCart: false },
        "Fifth Head of Cerberus": { pair: "Always Coming Home", inCart: false },
        "Borges Collected Fictions": { pair: "Gödel, Escher, Bach", inCart: false },
        "The Fifth Season": { pair: "The Knight and The Wizard", inCart: false },
        "If on a winter's night a traveler": { pair: "House of Leaves", inCart: true },
        "The Crying of Lot 49": { pair: "Pale Fire", inCart: true },
        "Pale Fire": { pair: "The Crying of Lot 49", inCart: true },
        "House of Leaves": { pair: "If on a winter's night a traveler", inCart: true }
};

const manualTiles = [
        "read from someone else's 2025 list",
        "recommended by librarian/bookstore",
        "saw someone reading in the wild",
        "read solely based on recommendation",
        "from 2026 awards list",
        "author named as inspiration of 2 favorites"
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getChosenTiles(bookName) {
        const book = books[bookName];
        return Object.entries(book.tiles)
                .filter(([tile, isChosen]) => isChosen)
                .map(([tile, _]) => tile);
}

function getApplicableNotChosen(bookName) {
        const book = books[bookName];
        return Object.entries(book.tiles)
                .filter(([tile, isChosen]) => !isChosen)
                .map(([tile, _]) => tile);
}

function calculateTileCounts() {
        const tileCounts = {};

        for (const [bookName, bookData] of Object.entries(books)) {
                const chosenTiles = getChosenTiles(bookName);

                for (const tile of chosenTiles) {
                        if (!tileCounts[tile]) {
                                tileCounts[tile] = [];
                        }
                        tileCounts[tile].push(bookName);
                }
        }

        return tileCounts;
}

function getAltTiles(bookName, parentTile, tileCounts) {
        const parentCount = tileCounts[parentTile].length;
        const chosenTiles = getChosenTiles(bookName);
        const applicableNotChosen = getApplicableNotChosen(bookName);

        const altTiles = [];

        for (const tile of applicableNotChosen) {
                const tileCount = tileCounts[tile]?.length || 0;

                // Only include if parent has at least 2 more books than alt tile
                if (parentCount - tileCount >= 2 && (tile != 'dialectics' || dialecticsPairs[bookName].inCart)) {
                        altTiles.push({
                                name: tile,
                                count: tileCount
                        });
                }
        }

        // Sort by count ascending
        return altTiles.sort((a, b) => a.count - b.count);
}

function calculateStandardDeviation(tileCounts) {
        // Exclude manual tiles from calculation
        const counts = Object.entries(tileCounts)
                .filter(([tile, _]) => !manualTiles.includes(tile))
                .map(([_, books]) => books.length);

        const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / counts.length;
        const stdDev = Math.sqrt(variance);

        return {
                mean: mean.toFixed(2),
                stdDev: stdDev.toFixed(2),
                counts: counts
        };
}

// ============================================================================
// FORMAT GENERATORS
// ============================================================================

function generateBingoFormat() {
        const tileCounts = calculateTileCounts();

        // Sort tiles by count descending, then alphabetically
        const sortedTiles = Object.entries(tileCounts)
                .sort((a, b) => {
                        if (b[1].length !== a[1].length) {
                                return b[1].length - a[1].length;
                        }
                        return a[0].localeCompare(b[0]);
                });

        let output = "# Shopping Cart in Bingo Format (33 Books)\n\n";

        for (const [tile, booksList] of sortedTiles) {
                output += `## ${tile} (${booksList.length})\n`;

                for (const bookName of booksList) {
                        const book = books[bookName];
                        const tierLabel = book.is_unlimited ? "Tier 1 - unlimited" : `Tier ${book.tier}`;
                        const sourceLabel = book.source === "wishlist" ? " - from wishlist" : "";
                        const prefix = book.tier === 1 ? "**" : "";

                        output += `- ${prefix}${bookName}${prefix} (${tierLabel}${sourceLabel})\n`;
                }

                output += "\n";
        }

        // Add manual tiles
        for (const tile of manualTiles) {
                output += `## ${tile} (0)\n*Manual tile*\n\n`;
        }

        // Add statistics
        const stats = calculateStandardDeviation(tileCounts);
        const nonManualTileCount = Object.keys(tileCounts).filter(t => !manualTiles.includes(t)).length;

        output += "---\n\n";
        output += "## Standard Deviation Calculation\n\n";
        output += `**Tile distribution (books per tile) for ${nonManualTileCount} non-manual tiles:**\n`;

        // Count distribution
        const distribution = {};
        for (const count of stats.counts) {
                distribution[count] = (distribution[count] || 0) + 1;
        }

        const sortedDist = Object.entries(distribution).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
        for (const [count, numTiles] of sortedDist) {
                output += `- ${count} books: ${numTiles} tile${numTiles > 1 ? 's' : ''}\n`;
        }

        output += `\n**Data:** [${stats.counts.sort((a, b) => b - a).join(', ')}]\n\n`;
        output += `**Mean:** ${stats.mean} books per tile\n`;
        output += `**Standard Deviation:** ${stats.stdDev}\n`;

        return output;
}

function generateBingoRefactoringFormat() {
        const tileCounts = calculateTileCounts();

        // Sort tiles by count descending
        const sortedTiles = Object.entries(tileCounts)
                .sort((a, b) => {
                        if (b[1].length !== a[1].length) {
                                return b[1].length - a[1].length;
                        }
                        return a[0].localeCompare(b[0]);
                });

        let output = "# Shopping Cart in Bingo Refactoring Format\n\n";

        for (const [parentTile, booksList] of sortedTiles) {
                const booksWithAltTiles = [];

                for (const bookName of booksList) {
                        const altTiles = getAltTiles(bookName, parentTile, tileCounts);

                        if (altTiles.length > 0) {
                                booksWithAltTiles.push({
                                        name: bookName,
                                        tier: books[bookName].tier,
                                        source: books[bookName].source,
                                        altTiles: altTiles
                                });
                        }
                }

                // Only include tiles that have books with alt tiles
                if (booksWithAltTiles.length > 0) {
                        output += `## ${parentTile} (${booksList.length})\n`;

                        for (const book of booksWithAltTiles) {
                                const tierLabel = `Tier ${book.tier}`;
                                const sourceLabel = book.source === "wishlist" ? " - from wishlist" : "";
                                const prefix = book.tier === 1 ? "**" : "";

                                output += `- ${prefix}${book.name}${prefix} (${tierLabel}${sourceLabel})\n`;
                                output += `  - **Alt tiles:**\n`;

                                for (const altTile of book.altTiles) {
                                        let tileLabel = `${altTile.name} (${altTile.count})`;

                                        // Add dialectics pairing info if applicable
                                        if (altTile.name === "dialectics" && dialecticsPairs[book.name]) {
                                                const pairInfo = dialecticsPairs[book.name];

                                                const cartStatus = pairInfo.inCart ? "in shopping cart" : "NOT in shopping cart";
                                                tileLabel += ` - paired with ${pairInfo.pair} (${cartStatus})`;
                                        }

                                        output += `    - ${tileLabel}\n`;
                                }

                                output += "\n";
                        }
                }
        }

        // Add statistics
        const stats = calculateStandardDeviation(tileCounts);
        output += "---\n\n";
        output += `**Standard Deviation: ${stats.stdDev}**\n`;
        output += `**Mean: ${stats.mean} books per tile**\n`;

        return output;
}

function generateBookFormat() {
        const tileCounts = calculateTileCounts();

        // Group by tier
        const byTier = { 1: [], 2: [], 3: [], 4: [] };

        for (const [bookName, bookData] of Object.entries(books)) {
                byTier[bookData.tier].push({
                        name: bookName,
                        author: bookData.author,
                        source: bookData.source,
                        is_unlimited: bookData.is_unlimited,
                        chosenTiles: getChosenTiles(bookName),
                        applicableNotChosen: getApplicableNotChosen(bookName)
                });
        }

        let output = "# Shopping Cart in Book Format (33 Books)\n\n";
        let bookNumber = 1;

        for (const tier of [1, 2, 3, 4]) {
                const tierBooks = byTier[tier];
                if (tierBooks.length === 0) continue;

                output += `## Tier ${tier} (${tierBooks.length} book${tierBooks.length > 1 ? 's' : ''})\n\n`;

                for (const book of tierBooks) {
                        const unlimitedLabel = book.is_unlimited ? " - UNLIMITED" : "";
                        const sourceLabel = book.source === "wishlist" ? " - FROM WISHLIST" : "";

                        output += `**${bookNumber}. ${book.name} (${book.author})${unlimitedLabel}${sourceLabel}**\n`;

                        // Chosen tiles
                        const chosenCount = book.chosenTiles.length;
                        output += `- **Chosen tiles (${chosenCount}):** ${book.chosenTiles.join(', ')}\n`;

                        // Applicable but not chosen
                        if (book.applicableNotChosen.length > 0) {
                                output += `- **Applicable but not chosen:** `;

                                const applicableList = book.applicableNotChosen.map(tile => {
                                        if (tile === "dialectics" && dialecticsPairs[book.name]) {
                                                const pairInfo = dialecticsPairs[book.name];
                                                const cartStatus = pairInfo.inCart ? "IN shopping cart" : "NOT in shopping cart";
                                                return `${tile} (paired with ${pairInfo.pair} - ${cartStatus})`;
                                        }
                                        return tile;
                                });

                                output += applicableList.join(', ');
                                output += "\n";
                        } else {
                                output += `- **Applicable but not chosen:** none\n`;
                        }

                        output += "\n";
                        bookNumber++;
                }
        }

        // Add summary
        const stats = calculateStandardDeviation(tileCounts);
        output += "---\n\n";
        output += "## Shopping Cart Summary\n";
        output += `- **Total: 33 books** (${byTier[1].length} Tier 1, ${byTier[2].length} Tier 2, ${byTier[3].length} Tier 3, ${byTier[4].length} Tier 4)\n`;
        output += `- **Added from wishlist: 1 book** (House of Leaves)\n`;
        output += `- **Standard Deviation: ${stats.stdDev}**\n`;
        output += `- **Mean: ${stats.mean} books per tile**\n`;

        return output;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
console.log("=".repeat(80));
console.log("BINGO FORMAT");
console.log("=".repeat(80));
console.log(generateBingoFormat());
