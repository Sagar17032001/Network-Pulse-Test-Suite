// server.js (optional) - simple endpoint to save posted results
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json({limit:'5mb'}));
const OUT = path.join(__dirname,'saved_results.json');

app.post('/save', (req,res)=>{
  const body = req.body;
  // append to file
  let arr = [];
  if(fs.existsSync(OUT)){
    try{ arr = JSON.parse(fs.readFileSync(OUT)); }catch(e){}
  }
  arr.unshift({ ts: new Date().toISOString(), data: body });
  fs.writeFileSync(OUT, JSON.stringify(arr, null, 2));
  res.json({ok:true});
});

app.get('/list',(req,res)=>{
  let arr=[]; if(fs.existsSync(OUT)){ try{ arr = JSON.parse(fs.readFileSync(OUT)); }catch(e){} }
  res.json(arr);
});

app.listen(3000, ()=> console.log('Server running on http://localhost:3000'));
