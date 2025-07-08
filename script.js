const APP_VERSION = '1.0.0';
document.getElementById('version').textContent = `Version ${APP_VERSION}`;

function readFile(file) {
    if (file.type === 'application/pdf') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const typedarray = new Uint8Array(e.target.result);
                pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                    const pages = [];
                    const promises = [];
                    for (let i = 1; i <= pdf.numPages; i++) {
                        promises.push(pdf.getPage(i).then(page => {
                            return page.getTextContent().then(tc => {
                                const text = tc.items.map(item => item.str).join(' ');
                                pages.push(text);
                            });
                        }));
                    }
                    Promise.all(promises).then(() => {
                        resolve({name: file.name, text: pages.join(' ')});
                    });
                });
            };
            reader.readAsArrayBuffer(file);
        });
    }
    return file.text().then(text => ({name: file.name, text}));
}

function readFiles(files) {
    return Promise.all(Array.from(files).map(readFile));
}

function tokenize(text) {
    return text.toLowerCase().match(/\b\w+\b/g) || [];
}

function computeTfIdf(docs) {
    const vocab = new Map();
    docs.forEach(doc => {
        const tokens = tokenize(doc.text);
        const counts = {};
        tokens.forEach(t => {
            counts[t] = (counts[t] || 0) + 1;
        });
        doc.tokens = tokens;
        doc.counts = counts;
    });
    // compute df
    docs.forEach(doc => {
        const seen = new Set();
        doc.tokens.forEach(t => {
            if (!seen.has(t)) {
                seen.add(t);
                vocab.set(t, (vocab.get(t) || 0) + 1);
            }
        });
    });
    const totalDocs = docs.length;
    const idf = {};
    vocab.forEach((df, term) => {
        idf[term] = Math.log(totalDocs / (1 + df));
    });
    docs.forEach(doc => {
        const vec = {};
        Object.keys(doc.counts).forEach(term => {
            const tf = doc.counts[term] / doc.tokens.length;
            vec[term] = tf * idf[term];
        });
        doc.vector = vec;
    });
}

function dot(a, b) {
    let sum = 0;
    for (const term in a) {
        if (b[term]) sum += a[term] * b[term];
    }
    return sum;
}

function norm(vec) {
    return Math.sqrt(dot(vec, vec));
}

function cosineSimilarity(a, b) {
    return dot(a, b) / (norm(a) * norm(b) || 1);
}

function buildGraph(docs) {
    const nodes = [];
    const links = [];
    const catIndex = new Map();

    docs.forEach((doc, idx) => {
        nodes.push({id: `doc-${idx}`, name: doc.name, type: 'doc', summary: doc.summary});
        doc.categories.forEach(cat => {
            if (!catIndex.has(cat)) {
                const id = `cat-${catIndex.size}`;
                catIndex.set(cat, id);
                nodes.push({id, name: cat, type: 'category'});
            }
            links.push({source: `doc-${idx}`, target: catIndex.get(cat), value: 1});
        });
    });

    return {nodes, links};
}

async function categorizeDocuments(docs, apiKey) {
    const system = "You extract relevant categories from the provided document and" +
                   " return them as a JSON array of short category names.";
    for (const doc of docs) {
        const text = doc.text.slice(0, 2000);
        const body = {
            model: "gpt-3.5-turbo",
            messages: [
                {role: "system", content: system},
                {role: "user", content: text}
            ],
            temperature: 0.2
        };
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        try {
            doc.categories = JSON.parse(data.choices[0].message.content);
        } catch (e) {
            doc.categories = [];
        }
    }
}

async function summarizeDocuments(docs, apiKey) {
    const system = "You are a helpful assistant that summarizes a document in a few concise sentences.";
    for (const doc of docs) {
        const text = doc.text.slice(0, 2000);
        const body = {
            model: "gpt-3.5-turbo",
            messages: [
                {role: "system", content: system},
                {role: "user", content: text}
            ],
            temperature: 0.3
        };
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });
        const data = await resp.json();
        doc.summary = (data.choices && data.choices[0].message.content.trim()) || '';
    }
}

function render(graph) {
    const width = document.getElementById('graph').clientWidth;
    const height = document.getElementById('graph').clientHeight;
    const svg = d3.select('#graph').append('svg');
    const simulation = d3.forceSimulation(graph.nodes)
        .force('link', d3.forceLink(graph.links).distance(100).strength(d => d.value))
        .force('charge', d3.forceManyBody().strength(-200))
        .force('center', d3.forceCenter(width / 2, height / 2));

    const link = svg.append('g')
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6)
        .selectAll('line')
        .data(graph.links)
        .enter().append('line')
        .attr('stroke-width', d => 1 + d.value * 5);

    const node = svg.append('g')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .selectAll('circle')
        .data(graph.nodes)
        .enter().append('circle')
        .attr('r', 8)
        .attr('fill', d => d.type === 'category' ? '#28a745' : '#007bff')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended))
        .on('click', clicked);

    const label = svg.append('g')
        .selectAll('text')
        .data(graph.nodes)
        .enter().append('text')
        .text(d => d.name)
        .attr('x', 12)
        .attr('y', 3)
        .style('font-size', '12px');

    simulation.on('tick', () => {
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        node
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        label
            .attr('x', d => d.x)
            .attr('y', d => d.y);
    });

    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
    }

    function clicked(event, d) {
        if (d.type === 'doc') {
            document.getElementById('summary').innerHTML = `<h3>${d.name}</h3><p>${d.summary || ''}</p>`;
        }
    }
}

function generate() {
    const files = document.getElementById('files').files;
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!files.length || !apiKey) {
        alert('Please select files and provide an OpenAI API key.');
        return;
    }
    readFiles(files).then(async docs => {
        await categorizeDocuments(docs, apiKey);
        await summarizeDocuments(docs, apiKey);
        const graph = buildGraph(docs);
        document.getElementById('graph').innerHTML = '';
        render(graph);
    });
}

document.getElementById('generate').addEventListener('click', generate);
