// ===== Firebase Setup =====
const firebaseConfig = {
  apiKey: "AIzaSyBApPldfCWTdLkeRBbiBYndkS9fXN1uz4E",
  authDomain: "dynabuild-595a1.firebaseapp.com",
  projectId: "dynabuild-595a1",
  storageBucket: "dynabuild-595a1.firebasestorage.app",
  messagingSenderId: "234088695254",
  appId: "1:234088695254:web:e80f98693373252bbc9077",
  measurementId: "G-72W83ZG6JK"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const cubesRef = db.ref('cubes');
const chatRef = db.ref('chat');
const playersRef = db.ref('players');

// ===== Player Setup =====
const playerId = Date.now() + Math.random();
let playerName = prompt("Enter your player name:", "Player" + Math.floor(Math.random()*1000));
playersRef.child(playerId).set({name: playerName, x:0, y:1.6, z:5});
window.addEventListener('beforeunload', ()=>playersRef.child(playerId).remove());

// ===== Three.js Setup =====
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Ground
const groundGeo = new THREE.PlaneGeometry(100,100);
const groundMat = new THREE.MeshPhongMaterial({color:0xaaaaaa});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI/2;
scene.add(ground);

// Load local avatar
const loader = new THREE.STLLoader();
let localAvatar;
loader.load('avatar.stl', geometry => {
  const mat = new THREE.MeshPhongMaterial({color:0x00ff00});
  localAvatar = new THREE.Mesh(geometry, mat);
  localAvatar.scale.set(0.1,0.1,0.1);
  scene.add(localAvatar);
});

// Store other players
let otherPlayers = {};

// Controls
const controls = new THREE.PointerLockControls(camera, document.body);
document.body.addEventListener('click',()=>controls.lock());
camera.position.set(0,1.6,5);

// ===== Cube Building =====
let cubes = {};
const cubeSize = 1;
const colorPicker = document.getElementById('colorPicker');
const raycaster = new THREE.Raycaster();

function placeCube(pos, color, id){
    const geo = new THREE.BoxGeometry(cubeSize,cubeSize,cubeSize);
    const mat = new THREE.MeshPhongMaterial({color});
    const cube = new THREE.Mesh(geo, mat);
    cube.position.copy(pos);
    scene.add(cube);
    if(id) cubes[id] = cube;
}

function removeCube(id){
    if(cubes[id]){
        scene.remove(cubes[id]);
        delete cubes[id];
    }
}

window.addEventListener('mousedown', e=>{
    raycaster.setFromCamera({x:0,y:0}, camera);
    if(e.button===0){ // left click
        const intersects = raycaster.intersectObjects([...Object.values(cubes), ground]);
        if(intersects.length>0){
            const p = intersects[0].point;
            const pos = new THREE.Vector3(
                Math.round(p.x/cubeSize)*cubeSize,
                Math.round(p.y/cubeSize)*cubeSize + cubeSize/2,
                Math.round(p.z/cubeSize)*cubeSize
            );
            const id = Date.now() + Math.random();
            placeCube(pos, colorPicker.value, id);
            cubesRef.child(id).set({x:pos.x, y:pos.y, z:pos.z, color:colorPicker.value});
        }
    }
    if(e.button===2){ // right click
        const intersects = raycaster.intersectObjects(Object.values(cubes));
        if(intersects.length>0){
            const cube = intersects[0].object;
            const id = Object.keys(cubes).find(k=>cubes[k]===cube);
            removeCube(id);
            cubesRef.child(id).remove();
        }
    }
});
window.addEventListener('contextmenu', e=>e.preventDefault());

// ===== Multiplayer Cube Sync =====
cubesRef.on('child_added', snapshot=>{
    const data = snapshot.val();
    placeCube(new THREE.Vector3(data.x,data.y,data.z), data.color, snapshot.key);
});
cubesRef.on('child_removed', snapshot=>{
    removeCube(snapshot.key);
});

// ===== Chat System =====
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const badWords = ['badword1','badword2']; // add more

function censor(text){
    let censored = text;
    badWords.forEach(word=>{
        const regex = new RegExp(word,'gi');
        censored = censored.replace(regex, '*'.repeat(word.length));
    });
    return censored;
}

chatInput.addEventListener('keydown', e=>{
    if(e.key==='Enter' && chatInput.value.trim()!==''){
        const msg = censor(chatInput.value.trim());
        chatRef.push({message: msg, name: playerName, timestamp: Date.now()});
        chatInput.value='';
    }
});

chatRef.on('child_added', snapshot=>{
    const data = snapshot.val();
    const msgDiv = document.createElement('div');
    const time = new Date(data.timestamp).toLocaleTimeString();
    msgDiv.textContent = `[${time}] ${data.name}: ${data.message}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// ===== Player Sync =====
function updatePlayerPosition(){
    playersRef.child(playerId).update({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
    });
}
setInterval(updatePlayerPosition, 50);

playersRef.on('child_added', snapshot=>{
    if(snapshot.key !== playerId){
        const otherGeo = new THREE.BoxGeometry(0.5,1,0.5);
        const otherMat = new THREE.MeshPhongMaterial({color:0xff0000});
        const mesh = new THREE.Mesh(otherGeo, otherMat);
        scene.add(mesh);
        otherPlayers[snapshot.key] = mesh;
    }
});

playersRef.on('child_removed', snapshot=>{
    if(otherPlayers[snapshot.key]){
        scene.remove(otherPlayers[snapshot.key]);
        delete otherPlayers[snapshot.key];
    }
});

playersRef.on('value', snapshot=>{
    snapshot.forEach(playerSnap=>{
        if(playerSnap.key !== playerId && otherPlayers[playerSnap.key]){
            const p = playerSnap.val();
            otherPlayers[playerSnap.key].position.set(p.x, p.y, p.z);
        }
    });
});

// ===== Animation Loop =====
function animate(){
    requestAnimationFrame(animate);
    if(localAvatar) localAvatar.position.copy(camera.position);
    renderer.render(scene,camera);
}
animate();
