import { useId, useRef, useState } from 'react'
import { asset, environmentalStatus, flightPosition, kegLevel, number, summarySports } from './retro-model.mjs'
import { PagedItems } from './ScreenDeck'
import { aircraftArt } from './retro-aircraft.mjs'
import SportsTeamHub from './SportsTeamHub'
import { nextGameLabel, orderSportsTeams } from './sports-team-model'

const timeOptions = { timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit' }
const integer = value => number(value)===null ? '—' : Math.round(value).toLocaleString()
function FeedMessage({ data, empty }) {
  return data.loading ? <p className="retro-message">Loading…</p> : data.error ? <p className="retro-message error" role="status">Data unavailable{data.lastUpdated ? ' · last reading retained' : ''}</p> : empty ? <p className="retro-message">{empty}</p> : null
}
export function RetroHeader({ now, activePage, title, weather, compact, navigate }) {
  const parts = new Intl.DateTimeFormat('en-US',{...timeOptions,hour12:true}).formatToParts(now)
  return <section className={`retro-hero ${activePage==='home'?'is-home':''} ${compact?'is-compact':''}`} aria-label="Shep Shack time and weather">
    {activePage!=='home'&&<button className="retro-back" onClick={()=>navigate('home')}>← HOME</button>}
    <button className="retro-brand" onClick={()=>navigate('home')} aria-label="Shep Shack home"><img src={asset('shep-shack.png')} alt="Shep Shack"/></button>
    <div className="retro-clock"><time dateTime={now.toISOString()}>{parts.filter(p=>p.type!=='dayPeriod').map(p=>p.value).join('').trim()}<small>{parts.find(p=>p.type==='dayPeriod')?.value}</small></time><span>{now.toLocaleDateString('en-US',{timeZone:'America/Los_Angeles',weekday:'short',month:'short',day:'numeric'}).replace(',','').toUpperCase()}</span><button onClick={()=>navigate('weather')} className="retro-weather">{weather ? `${weather.temp}° · ${weather.description}` : 'WEATHER ↗'}</button></div>
    {activePage!=='home'&&<div className="retro-title"><p>SHEP SHACK</p><h1>{title}<span>.</span></h1></div>}
  </section>
}
export function RetroKegGauge({ level, small=false, liquid='beer' }) {
  const id=useId().replaceAll(':','')
  return <svg className={`retro-keg-gauge ${small?'small':''}`} viewBox="0 0 200 280" role="img" aria-label={level===null?'Keg level unavailable':`${level}% remaining`}>
    <defs><linearGradient id={`${id}-metal`}><stop stopColor="#42565a"/><stop offset=".3" stopColor="#1a3035"/><stop offset=".72" stopColor="#15292e"/><stop offset="1" stopColor="#536568"/></linearGradient><linearGradient id={`${id}-beer`} x1="0" y1="1" x2="0" y2="0"><stop stopColor={liquid==='water'?'#1b64b3':'#a8560b'}/><stop offset=".6" stopColor={liquid==='water'?'#409cef':'#e5a323'}/><stop offset="1" stopColor={liquid==='water'?'#a9d8ff':'#f8c750'}/></linearGradient><clipPath id={id}><path d="M30 35Q100 15 170 35L174 245Q100 270 26 245Z"/></clipPath></defs>
    <path d="M30 35Q100 15 170 35L174 245Q100 270 26 245Z" fill={`url(#${id}-metal)`} stroke="#d8d2b9" strokeWidth="3"/>
    <g clipPath={`url(#${id})`}><rect x="20" y={260-(level??0)*2.3} width="160" height="260" fill={`url(#${id}-beer)`}/>{liquid==='beer'&&level!==null&&level>0&&<rect x="20" y={260-level*2.3} width="160" height="8" fill="#ffe8b5"/>}</g>
    {[65,115,165,215,245].map(y=><path key={y} d={`M28 ${y}Q100 ${y+22} 172 ${y}L172 ${y+7}Q100 ${y+29} 28 ${y+7}Z`} fill="#10282b99" stroke="#e4cba6" strokeWidth="2"/>)}
    <ellipse cx="100" cy="34" rx="71" ry="15" fill="#102126" stroke="#f4d8ac" strokeWidth="3"/><ellipse cx="100" cy="34" rx="57" ry="9" fill="#081316" stroke="#c3b58a"/><rect x="83" y="23" width="34" height="12" rx="4" fill="#081316" stroke="#f4d8ac"/>
  </svg>
}
function HomeKegTap({ data = {}, label, scaleId, liquid, now, onNavigate }) {
  const level = data.loading || data.error ? null : kegLevel(data.keg)
  const stale = data.lastUpdated && now - new Date(data.lastUpdated) > 600000
  const status = data.loading ? 'Checking…' : data.error ? 'Unavailable' : stale ? 'Stale reading' : !data.keg ? 'Awaiting scale' : data.keg.ready ? 'Ready' : 'Not ready'
  const pours = level === null ? null : number(data.keg?.pintsLeft)
  return <button className={`home-keg-tap ${liquid}`} onClick={() => onNavigate('keg', scaleId)} aria-label={`Open ${label} keg`}>
    <span className="home-keg-heading"><span className="home-keg-tap-number">{liquid === 'water' ? 'TAP 01' : 'TAP 02'}</span><span className="home-keg-label">{data.displayName ?? label}</span></span>
    <span className="home-keg-art"><RetroKegGauge level={level} liquid={liquid} small/></span>
    <strong className="home-keg-percent">{level ?? '—'}{level !== null && <small>%</small>}</strong>
    <span className="home-keg-volume" title={liquid === 'water' ? '16 oz per pour' : undefined}><b>{pours === null ? '—' : pours.toFixed(1)}</b><span>{liquid === 'water' ? 'pours left' : 'pints left'}</span></span>
    <span className={`home-keg-status ${stale || data.error ? 'is-stale' : ''}`}><span><i/>{status}</span><b>↗</b></span>
  </button>
}
export function RetroHome({now,onNavigate,flightData,fireData,safetyData,padresData,sportsData,weatherData,kegData,waterKegData,aircraftName,flightDistanceMi}) {
  const games=summarySports(padresData,sportsData)
  const level=kegLevel(kegData.keg)
  const env=environmentalStatus(safetyData,fireData)
  const notices=(safetyData.weatherAlerts?.length??0)+(safetyData.countyEmergencies?.length??0)
  const staleKeg=kegData.lastUpdated && now-new Date(kegData.lastUpdated)>600000
  const lead=games[0]
  const nearby=[...flightData.flights].sort((a,b)=>(flightDistanceMi(a)??Infinity)-(flightDistanceMi(b)??Infinity)).slice(0,3)
  const latestQuake=safetyData.earthquakes?.[0]
  const safetyReading=(data,value)=>data.loading?'Checking…':data.error?'Unavailable':value
  const priorities=[
    ...(safetyData.countyEmergencies??[]).slice(0,1).map(n=>({title:n.type,detail:n.label||n.notes,page:'fire'})),
    ...(safetyData.weatherAlerts??[]).slice(0,1).map(n=>({title:n.event,detail:n.headline,page:'fire'})),
    ...(fireData.incidents??[]).slice(0,1).map(n=>({title:'Wildfire nearby',detail:n.name,page:'fire'})),
    ...(number(safetyData.airQuality?.aqi)>100?[{title:'Poor air quality',detail:`AQI ${Math.round(safetyData.airQuality.aqi)}`,page:'fire'}]:[]),
    ...(safetyData.earthquakes??[]).filter(q=>q.time&&now-new Date(q.time)<86400000).slice(0,1).map(q=>({title:`M ${q.magnitude?.toFixed(1)} earthquake`,detail:q.place,page:'fire'})),
    ...(kegData.error||staleKeg?[{title:'Keg monitor unavailable',detail:staleKeg?'Reading over 10 minutes old':'Check sensor data',page:'keg'}]:level!==null&&level<=20?[{title:'Keg running low',detail:`${level}% remaining`,page:'keg'}]:[]),
  ]
  return <div className="retro-home-screen">
    {priorities.length>0&&<aside className="retro-priorities" aria-label="Needs attention"><PagedItems items={priorities} size={1} label="Priority notices">{(item,i)=><button key={i} onClick={()=>onNavigate(item.page)}><strong>{item.title}</strong><span>{item.detail}</span><b>↗</b></button>}</PagedItems></aside>}
    <section className="retro-home-tiles" aria-label="Home dashboard">
      <article className="retro-tile sports"><h2><button onClick={()=>onNavigate('sports')}>SPORTS <span>›</span></button></h2><FeedMessage data={{loading:padresData.loading&&sportsData.loading,error:padresData.error||sportsData.error}}/>
        <div className="retro-home-score"><img src={lead?.logo} alt=""/><strong>{lead?.shortName}</strong><b>{integer(lead?.score)}</b><small>{lead?.status}{lead?.gameDate&&!lead.isLive?` · ${new Date(lead.gameDate).toLocaleDateString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric'})}`:''}</small><span>{lead?.opponent||'No game result available'}</span><b>{integer(lead?.opponentScore)}</b></div>
        <div className="retro-other-scores">{games.filter(g=>g.key!==lead?.key).map(g=><div key={g.key}><span>{g.shortName}</span><strong>{integer(g.score)}–{integer(g.opponentScore)}</strong><small>{g.opponent||'—'}</small></div>)}</div>
      </article>
      <article className="retro-tile keg"><h2><button onClick={()=>onNavigate('keg','beer')}>KEGS <span>›</span></button></h2><div className="home-keg-pair">
        <HomeKegTap data={waterKegData} label="Sparkling Water" scaleId="sparkling-water" liquid="water" now={now} onNavigate={onNavigate}/>
        <HomeKegTap data={kegData} label="Beer" scaleId="beer" liquid="beer" now={now} onNavigate={onNavigate}/>
      </div></article>
      <article className="retro-tile flights"><h2><button onClick={()=>onNavigate('flights')}>FLIGHTS <span>›</span></button></h2><FeedMessage data={flightData} empty={!flightData.flights.length?'No aircraft detected nearby':null}/><p className="retro-tile-eyebrow">NEAREST TO SANTEE</p><div className="home-aircraft-list">{nearby.map(ac=><button key={ac.hex} onClick={()=>onNavigate('flights')}><span><strong>{ac.flight?.trim()||ac.r||ac.hex}</strong><small>{aircraftName(ac)} · {ac.route?.originCode&&ac.route?.destCode?`${ac.route.originCode} → ${ac.route.destCode}`:'Route unavailable'}</small></span><span><b>{flightDistanceMi(ac)===null?'—':`${flightDistanceMi(ac).toFixed(1)} mi`}</b><small>{integer(ac.alt_baro)} ft</small></span></button>)}</div><p className="retro-tile-note">{flightData.flights.length} AIRCRAFT <span>OPEN RADAR ↗</span></p></article>
      <article className="retro-tile safety"><h2><button onClick={()=>onNavigate('fire')}>SAFETY <span>›</span></button></h2><div className={`home-safety-status ${env.tone}`}><span className="home-status-dot"/><strong>{env.title}</strong></div><div className="home-safety-readings">
        <div><span>Air quality</span><strong>{safetyReading(safetyData,`AQI ${integer(safetyData.airQuality?.aqi)}`)}</strong></div>
        <div><span>Weather & county</span><strong>{safetyReading(safetyData,notices?`${notices} active notice${notices===1?'':'s'}`:'No active notices')}</strong></div>
        <div><span>Wildfires nearby</span><strong>{safetyReading(fireData,fireData.incidents?.length?`${fireData.incidents.length} reported`:'None reported')}</strong></div>
        <div><span>Satellite heat</span><strong>{safetyReading(fireData,fireData.fires?.length?`${fireData.fires.length} detections`:'None detected')}</strong></div>
        <div><span>Latest earthquake</span><strong>{safetyReading(safetyData,latestQuake?`M ${latestQuake.magnitude?.toFixed(1)??'—'} · ${integer(latestQuake.distMi)} mi`:'None in past 7 days')}</strong></div>
      </div><p className="retro-tile-note">LOCAL CONDITIONS <span>MAP & DETAILS ↗</span></p></article>
    </section>
    <div className="retro-home-extras"><button onClick={()=>onNavigate('weather')}>{weatherData.loading?'Weather loading…':weatherData.error?'Weather unavailable':weatherData.weather?`${weatherData.weather.temp}° · ${weatherData.weather.description}`:'Weather'} ↗</button><button onClick={()=>onNavigate('fitness')}>FITNESS & TRAINING ↗</button><button onClick={()=>onNavigate('house')}>SETTINGS & NOTIFICATIONS ↗</button></div>
  </div>
}
export function RetroAircraftArtwork({code,modelName}) {
  const art=aircraftArt(code,modelName)
  const dialog=useRef(null)
  if (!art) return <div className="retro-art-empty">Illustration not available for {code||'this aircraft type'}.</div>
  const view=art.viewport
  const picture=<span className="retro-art-stage" style={{aspectRatio:`${view.width}/${view.height}`}}><img src={art.image} alt={`${art.name} illustration`} style={{width:`${view.canvasWidth/view.width*100}%`,left:`${-view.x/view.width*100}%`,top:`${-view.y/view.height*100}%`}}/></span>
  return <><button className="retro-art-button" style={art.maxDisplayWidth?{maxWidth:art.maxDisplayWidth}:undefined} onClick={()=>dialog.current.showModal()} aria-label={`Enlarge ${art.name} illustration`}>{picture}<span>↗</span></button><p className="retro-art-caption">{art.referenceNote||'ILLUSTRATED TYPE REFERENCE'}</p><dialog ref={dialog} className="retro-art-dialog" onClick={event=>{if(event.target===dialog.current)dialog.current.close()}}><button className="retro-dialog-close" onClick={()=>dialog.current.close()} aria-label="Close illustration">×</button><h2>{art.name}</h2>{picture}</dialog></>
}
export function RetroFlights({flightData,aircraftName,flightDistanceMi,flightRoute,flightIdent,radiusMiles}) {
  const displayName=ac=>{const art=aircraftArt(ac.t,aircraftName(ac));return art?.useFeedName?aircraftName(ac):art?.name??aircraftName(ac)}
  const [selectedHex,setSelectedHex]=useState(null)
  const [mobileView,setMobileView]=useState('list')
  const selectAircraft=hex=>{setSelectedHex(hex);setMobileView('aircraft')}
  const [query,setQuery]=useState('')
  const [sort,setSort]=useState('distance')
  const [range,setRange]=useState(radiusMiles)
  const visible=flightData.flights.filter(ac=>(flightDistanceMi(ac)??Infinity)<=range).filter(ac=>[flightIdent(ac),ac.r,displayName(ac),ac.route?.airline].some(value=>String(value??'').toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>sort==='altitude'?(b.alt_baro??-1)-(a.alt_baro??-1):(flightDistanceMi(a)??Infinity)-(flightDistanceMi(b)??Infinity))
  const selected=visible.find(ac=>ac.hex===selectedHex)??visible[0]
  const idx=visible.indexOf(selected)
  return <section className="retro-flight-page" data-mobile-view={mobileView}><div className="retro-flight-toolbar"><span>{flightData.loading?'CHECKING':`${visible.length} AIRCRAFT WITHIN ${range} MI`}</span><div role="group" aria-label="Radar range">{[5,10,25].map(value=><button key={value} aria-pressed={range===value} onClick={()=>setRange(value)}>{value} MI</button>)}</div></div><FeedMessage data={flightData}/><div className="retro-mobile-flight-tabs" role="group" aria-label="Flight view">{['list','radar','aircraft'].map(view=><button key={view} aria-pressed={mobileView===view} onClick={()=>setMobileView(view)}>{view}</button>)}</div><div className="retro-flight-layout">
    <div><div className="retro-large-radar" aria-label="Select aircraft on radar"><span className="north">N</span><span className="east">E</span><span className="south">S</span><span className="west">W</span><i className="retro-home-dot"/>{visible.map(ac=>{const pos=flightPosition(ac,range);return pos?<button key={ac.hex} className={`retro-radar-aircraft ${ac.hex===selected?.hex?'selected':''}`} style={{left:`${pos.left}%`,top:`${pos.top}%`}} aria-label={`Select ${flightIdent(ac)}`} aria-pressed={ac.hex===selected?.hex} onClick={()=>selectAircraft(ac.hex)}><svg viewBox="-20 -20 40 40" aria-hidden="true" style={{transform:`rotate(${ac.track??0}deg)`}}><path d={aircraftArt(ac.t,aircraftName(ac))?.rotorcraft?'M-2-16h4v7c5 1 7 4 7 8l-2 7-5 3v6l6 2v2H-8v-2l6-2V9l-5-3-2-7c0-4 2-7 7-8ZM-18-6h36v3h-36Z':'M0-16l3 12 13 8v3L3 3l-1 9 5 4v2l-7-2-7 2v-2l5-4-1-9-13 4V4l13-8Z'}/></svg>{ac.hex===selected?.hex&&<small>{flightIdent(ac)}</small>}</button>:null})}</div><p className="retro-radar-note">{range} MI RADIUS · SANTEE CENTER</p><p className="retro-radar-note">Orange marks the selected aircraft. North is up.</p></div>
    <section className="retro-flight-list" aria-label="Nearby aircraft"><label className="retro-search"><span>FIND AIRCRAFT</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Callsign, type, registration…"/></label><label className="retro-sort">Sort <select value={sort} onChange={e=>setSort(e.target.value)}><option value="distance">Nearest</option><option value="altitude">Highest</option></select></label><PagedItems items={visible} size={4} label="Aircraft">{ac=><button key={ac.hex} className={selected?.hex===ac.hex?'selected':''} aria-pressed={selected?.hex===ac.hex} onClick={()=>selectAircraft(ac.hex)}><span><strong>{flightIdent(ac)}</strong><small>{displayName(ac)}</small><small>{flightRoute(ac)==='—'?'Route unavailable':flightRoute(ac)}</small></span><span><b>{integer(ac.alt_baro)} ft</b><small>{flightDistanceMi(ac)?.toFixed(1)??'—'} mi</small></span></button>}</PagedItems>{!visible.length&&!flightData.loading&&<p className="retro-message">{query?'No matching aircraft in this range.':flightData.error?'Flight feed unavailable.':'No aircraft in this range. Try a wider radius.'}</p>}</section>
    <section className="retro-flight-detail" aria-label="Selected aircraft">{selected?<><div className="retro-flight-detail-heading"><div><p className="cardLabel">SELECTED AIRCRAFT</p><h2>{flightIdent(selected)}</h2></div><div>{[-1,1].map(step=><button key={step} disabled={visible.length<2} aria-label={step<0?'Previous aircraft':'Next aircraft'} onClick={()=>setSelectedHex(visible[(idx+step+visible.length)%visible.length].hex)}>{step<0?'←':'→'}</button>)}</div></div><p>{displayName(selected)}</p><small>{selected.route?.airline||'Operator not supplied'}</small><RetroAircraftArtwork code={selected.t} modelName={aircraftName(selected)}/><dl>{[['Route',flightRoute(selected)==='—'?'Not supplied':flightRoute(selected)],['Altitude',`${integer(selected.alt_baro)} ft`],['Distance',`${flightDistanceMi(selected)?.toFixed(1)??'—'} mi`],['Speed',`${integer(selected.gs)} kt`],['Heading',number(selected.track)===null?'—':`${Math.round(selected.track)}°`],['Registration',selected.r||'Not supplied']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{flightData.lastUpdated&&<p className="retro-radar-note">Updated {flightData.lastUpdated.toLocaleTimeString('en-US',timeOptions)} PT</p>}</>:<p className="retro-message">Select an aircraft to inspect.</p>}</section>
  </div></section>
}
export function RetroSports({padresData,sportsData,renderDetails,now}) {
  const [filter,setFilter]=useState('all')
  const [selected,setSelected]=useState(null)
  const allRows=orderSportsTeams(summarySports(padresData,sportsData),now)
  const rows=allRows.filter(row=>filter==='all'||(filter==='baseball'?row.league==='MLB':filter==='hockey'?['NHL','AHL'].includes(row.league):['MLS','NWSL'].includes(row.league)))
  const played=row=>row.isLive?'LIVE NOW':row.gameDate?new Date(row.gameDate).toLocaleDateString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric'}):row.gameDateLabel||'Latest result'
  const selectedTeam=allRows.find(row=>row.key===selected?.key)??selected
  if(selectedTeam) return <SportsTeamHub key={selectedTeam.key} team={selectedTeam} now={now} onBack={()=>setSelected(null)} renderDetails={renderDetails}/>
  return <section className="retro-sports-page"><div className="retro-sport-filters" role="group" aria-label="Filter teams">{['all','baseball','hockey','soccer'].map(value=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==='all'?'ALL TEAMS':value.toUpperCase()}</button>)}</div><FeedMessage data={{loading:sportsData.loading&&padresData.loading,error:sportsData.error||padresData.error,lastUpdated:sportsData.lastUpdated||padresData.lastUpdated}}/>
    <p className="sports-order-note">Live & upcoming games first · Team hubs stay useful between seasons · All times Pacific</p><div className="retro-score-headings"><span>HOME TEAMS</span><span>LATEST GAME</span><span>UP NEXT · PACIFIC</span></div>
    <div className="retro-sports-rows">{rows.map(row=><article key={row.key} className={row.isLive?'is-live':''}><div className="retro-sport-row"><div className="retro-team">{row.logo&&<img src={row.logo} alt=""/>}<div><p>{row.league}</p><h2>{row.shortName}</h2></div></div><div className="retro-score"><span className="sport-played-date">{played(row)}</span><div><strong>{integer(row.score)}<i>–</i>{integer(row.opponentScore)}</strong><small>{row.error?'Last available result':row.status}</small></div><p>{row.opponent?`vs ${row.opponent}`:'No game result available'}</p></div><div className="retro-next"><span className="sport-next-label">UP NEXT</span><strong>{nextGameLabel(row.next,now)}</strong>{row.next&&<p>{row.next.opponent||row.next.opponentAbbr}</p>}</div></div><button className="retro-game-details" onClick={()=>setSelected(row)}>TEAM HUB <span>↗</span></button></article>)}</div>
  </section>
}
