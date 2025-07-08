// React application for PDF summarization and chat
const { useState, useEffect, useRef } = React;

function readPdfFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const typedarray = new Uint8Array(e.target.result);
      pdfjsLib.getDocument(typedarray).promise.then(pdf => {
        const pages = [];
        const promises = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          promises.push(
            pdf.getPage(i).then(page =>
              page.getTextContent().then(tc => {
                pages.push(tc.items.map(item => item.str).join(' '));
              })
            )
          );
        }
        Promise.all(promises).then(() => resolve(pages.join(' ')));
      });
    };
    reader.readAsArrayBuffer(file);
  });
}

async function summarize(text, apiKey) {
  const body = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that summarizes a document in a few concise sentences.' },
      { role: 'user', content: text.slice(0, 2000) }
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
  return (data.choices && data.choices[0].message.content.trim()) || '';
}

async function askQuestion(question, text, apiKey, history) {
  const messages = [
    { role: 'system', content: 'You answer questions about the following document: ' + text.slice(0, 2000) },
    ...history,
    { role: 'user', content: question }
  ];
  const body = { model: 'gpt-3.5-turbo', messages, temperature: 0.3 };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  return (data.choices && data.choices[0].message.content.trim()) || '';
}

function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '');
  const [pdfText, setPdfText] = useState('');
  const [summary, setSummary] = useState('');
  const [history, setHistory] = useState([]); // chat history
  const [question, setQuestion] = useState('');

  useEffect(() => {
    localStorage.setItem('apiKey', apiKey);
  }, [apiKey]);

  const handleFile = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await readPdfFile(file);
    setPdfText(text);
    setSummary('');
    setHistory([]);
  };

  const generateSummary = async () => {
    if (!pdfText || !apiKey) return;
    const sum = await summarize(pdfText, apiKey);
    setSummary(sum);
  };

  const sendQuestion = async () => {
    if (!question.trim() || !apiKey) return;
    const userEntry = { role: 'user', content: question.trim() };
    const answer = await askQuestion(question.trim(), pdfText, apiKey, history);
    const botEntry = { role: 'assistant', content: answer };
    setHistory([...history, userEntry, botEntry]);
    setQuestion('');
  };

  return (
    React.createElement('div', { className: 'app-container' },
      React.createElement('div', { className: 'menu' }, 'PDF Chat App'),
      React.createElement('div', { className: 'content' },
        React.createElement('div', { className: 'controls' },
          React.createElement('input', {
            type: 'password',
            placeholder: 'OpenAI API Key',
            value: apiKey,
            onChange: e => setApiKey(e.target.value)
          }),
          React.createElement('input', { type: 'file', accept: 'application/pdf', onChange: handleFile }),
          React.createElement('button', { onClick: generateSummary }, 'Summarize')
        ),
        React.createElement('div', { className: 'summary' },
          React.createElement('h3', null, 'Summary'),
          React.createElement('textarea', { readOnly: true, value: summary })
        ),
        React.createElement('div', { className: 'chat' },
          React.createElement('div', { className: 'messages' },
            history.map((m, i) =>
              React.createElement('div', { key: i, className: m.role }, (m.role === 'user' ? 'You: ' : 'AI: ') + m.content)
            )
          ),
          React.createElement('div', { className: 'chat-input' },
            React.createElement('input', {
              type: 'text',
              placeholder: 'Ask a question...',
              value: question,
              onChange: e => setQuestion(e.target.value)
            }),
            React.createElement('button', { onClick: sendQuestion }, 'Send')
          )
        )
      )
    )
  );
}

ReactDOM.render(React.createElement(App), document.getElementById('root'));

