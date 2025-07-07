function readFiles(files) {
    return Promise.all(Array.from(files).map(file => {
        return file.text().then(text => ({name: file.name, text}));
    }));
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

function buildGraph(docs, threshold=0.1) {
    const nodes = docs.map((d, i) => ({id: i, name: d.name}));
    const links = [];
    for (let i = 0; i < docs.length; i++) {
        for (let j = i+1; j < docs.length; j++) {
            const sim = cosineSimilarity(docs[i].vector, docs[j].vector);
            if (sim > threshold) {
                links.push({source: i, target: j, value: sim});
            }
        }
    }
    return {nodes, links};
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
        .attr('fill', 'steelblue')
        .call(d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended));

    const label = svg.append('g')
        .selectAll('text')
        .data(graph.nodes)
        .enter().append('text')
        .text(d => d.name)
        .attr('x', 12)
        .attr('y', 3);

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
}

function generate() {
    const files = document.getElementById('files').files;
    if (!files.length) return;
    readFiles(files).then(docs => {
        computeTfIdf(docs);
        const graph = buildGraph(docs);
        document.getElementById('graph').innerHTML = '';
        render(graph);
    });
}

document.getElementById('generate').addEventListener('click', generate);
