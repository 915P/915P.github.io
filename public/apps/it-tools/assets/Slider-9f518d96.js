import{aP as We,cI as Je,p as x,cJ as qe,I as M,J as n,L as m,aE as _,be as Ge,bf as Qe,d as Ze,M as eo,N as ge,b as w,as as oo,s as ue,aV as Q,al as to,R as he,bW as ao,T as f,V as no,aT as j,b4 as U}from"./index-6b7fa7ee.js";import{f as fe}from"./fade-in-scale-up.cssr-7619e83a.js";import{u as ro}from"./use-form-item-ae22673e.js";import{u as lo}from"./use-merged-state-00e5f337.js";import{a as io}from"./resolve-slot-646ffcd9.js";import{c as ve}from"./call-7e0089d6.js";import{u as Z,V as so,a as co,b as uo}from"./Follower-af63a381.js";const ho=a=>{const l="rgba(0, 0, 0, .85)",y="0 2px 8px 0 rgba(0, 0, 0, 0.12)",{railColor:v,primaryColor:s,baseColor:d,cardColor:z,modalColor:R,popoverColor:O,borderRadius:L,fontSize:B,opacityDisabled:$}=a;return Object.assign(Object.assign({},Je),{fontSize:B,markFontSize:B,railColor:v,railColorHover:v,fillColor:s,fillColorHover:s,opacityDisabled:$,handleColor:"#FFF",dotColor:z,dotColorModal:R,dotColorPopover:O,handleBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",handleBoxShadowHover:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",handleBoxShadowActive:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",handleBoxShadowFocus:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",indicatorColor:l,indicatorBoxShadow:y,indicatorTextColor:d,indicatorBorderRadius:L,dotBorder:`2px solid ${v}`,dotBorderActive:`2px solid ${s}`,dotBoxShadow:""})},fo={name:"Slider",common:We,self:ho},vo=fo;function me(a){return window.TouchEvent&&a instanceof window.TouchEvent}function be(){const a=x(new Map),l=y=>v=>{a.value.set(y,v)};return qe(()=>{a.value.clear()}),[a,l]}const mo=M([n("slider",`
 display: block;
 padding: calc((var(--n-handle-size) - var(--n-rail-height)) / 2) 0;
 position: relative;
 z-index: 0;
 width: 100%;
 cursor: pointer;
 user-select: none;
 -webkit-user-select: none;
 `,[m("reverse",[n("slider-handles",[n("slider-handle-wrapper",`
 transform: translate(50%, -50%);
 `)]),n("slider-dots",[n("slider-dot",`
 transform: translateX(50%, -50%);
 `)]),m("vertical",[n("slider-handles",[n("slider-handle-wrapper",`
 transform: translate(-50%, -50%);
 `)]),n("slider-marks",[n("slider-mark",`
 transform: translateY(calc(-50% + var(--n-dot-height) / 2));
 `)]),n("slider-dots",[n("slider-dot",`
 transform: translateX(-50%) translateY(0);
 `)])])]),m("vertical",`
 padding: 0 calc((var(--n-handle-size) - var(--n-rail-height)) / 2);
 width: var(--n-rail-width-vertical);
 height: 100%;
 `,[n("slider-handles",`
 top: calc(var(--n-handle-size) / 2);
 right: 0;
 bottom: calc(var(--n-handle-size) / 2);
 left: 0;
 `,[n("slider-handle-wrapper",`
 top: unset;
 left: 50%;
 transform: translate(-50%, 50%);
 `)]),n("slider-rail",`
 height: 100%;
 `,[_("fill",`
 top: unset;
 right: 0;
 bottom: unset;
 left: 0;
 `)]),m("with-mark",`
 width: var(--n-rail-width-vertical);
 margin: 0 32px 0 8px;
 `),n("slider-marks",`
 top: calc(var(--n-handle-size) / 2);
 right: unset;
 bottom: calc(var(--n-handle-size) / 2);
 left: 22px;
 font-size: var(--n-mark-font-size);
 `,[n("slider-mark",`
 transform: translateY(50%);
 white-space: nowrap;
 `)]),n("slider-dots",`
 top: calc(var(--n-handle-size) / 2);
 right: unset;
 bottom: calc(var(--n-handle-size) / 2);
 left: 50%;
 `,[n("slider-dot",`
 transform: translateX(-50%) translateY(50%);
 `)])]),m("disabled",`
 cursor: not-allowed;
 opacity: var(--n-opacity-disabled);
 `,[n("slider-handle",`
 cursor: not-allowed;
 `)]),m("with-mark",`
 width: 100%;
 margin: 8px 0 32px 0;
 `),M("&:hover",[n("slider-rail",{backgroundColor:"var(--n-rail-color-hover)"},[_("fill",{backgroundColor:"var(--n-fill-color-hover)"})]),n("slider-handle",{boxShadow:"var(--n-handle-box-shadow-hover)"})]),m("active",[n("slider-rail",{backgroundColor:"var(--n-rail-color-hover)"},[_("fill",{backgroundColor:"var(--n-fill-color-hover)"})]),n("slider-handle",{boxShadow:"var(--n-handle-box-shadow-hover)"})]),n("slider-marks",`
 position: absolute;
 top: 18px;
 left: calc(var(--n-handle-size) / 2);
 right: calc(var(--n-handle-size) / 2);
 `,[n("slider-mark",`
 position: absolute;
 transform: translateX(-50%);
 white-space: nowrap;
 `)]),n("slider-rail",`
 width: 100%;
 position: relative;
 height: var(--n-rail-height);
 background-color: var(--n-rail-color);
 transition: background-color .3s var(--n-bezier);
 border-radius: calc(var(--n-rail-height) / 2);
 `,[_("fill",`
 position: absolute;
 top: 0;
 bottom: 0;
 border-radius: calc(var(--n-rail-height) / 2);
 transition: background-color .3s var(--n-bezier);
 background-color: var(--n-fill-color);
 `)]),n("slider-handles",`
 position: absolute;
 top: 0;
 right: calc(var(--n-handle-size) / 2);
 bottom: 0;
 left: calc(var(--n-handle-size) / 2);
 `,[n("slider-handle-wrapper",`
 outline: none;
 position: absolute;
 top: 50%;
 transform: translate(-50%, -50%);
 cursor: pointer;
 display: flex;
 `,[n("slider-handle",`
 height: var(--n-handle-size);
 width: var(--n-handle-size);
 border-radius: 50%;
 overflow: hidden;
 transition: box-shadow .2s var(--n-bezier), background-color .3s var(--n-bezier);
 background-color: var(--n-handle-color);
 box-shadow: var(--n-handle-box-shadow);
 `,[M("&:hover",`
 box-shadow: var(--n-handle-box-shadow-hover);
 `)]),M("&:focus",[n("slider-handle",`
 box-shadow: var(--n-handle-box-shadow-focus);
 `,[M("&:hover",`
 box-shadow: var(--n-handle-box-shadow-active);
 `)])])])]),n("slider-dots",`
 position: absolute;
 top: 50%;
 left: calc(var(--n-handle-size) / 2);
 right: calc(var(--n-handle-size) / 2);
 `,[m("transition-disabled",[n("slider-dot","transition: none;")]),n("slider-dot",`
 transition:
 border-color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 position: absolute;
 transform: translate(-50%, -50%);
 height: var(--n-dot-height);
 width: var(--n-dot-width);
 border-radius: var(--n-dot-border-radius);
 overflow: hidden;
 box-sizing: border-box;
 border: var(--n-dot-border);
 background-color: var(--n-dot-color);
 `,[m("active","border: var(--n-dot-border-active);")])])]),n("slider-handle-indicator",`
 font-size: var(--n-font-size);
 padding: 6px 10px;
 border-radius: var(--n-indicator-border-radius);
 color: var(--n-indicator-text-color);
 background-color: var(--n-indicator-color);
 box-shadow: var(--n-indicator-box-shadow);
 `,[fe()]),n("slider-handle-indicator",`
 font-size: var(--n-font-size);
 padding: 6px 10px;
 border-radius: var(--n-indicator-border-radius);
 color: var(--n-indicator-text-color);
 background-color: var(--n-indicator-color);
 box-shadow: var(--n-indicator-box-shadow);
 `,[m("top",`
 margin-bottom: 12px;
 `),m("right",`
 margin-left: 12px;
 `),m("bottom",`
 margin-top: 12px;
 `),m("left",`
 margin-right: 12px;
 `),fe()]),Ge(n("slider",[n("slider-dot","background-color: var(--n-dot-color-modal);")])),Qe(n("slider",[n("slider-dot","background-color: var(--n-dot-color-popover);")]))]),bo=0,go=Object.assign(Object.assign({},ge.props),{to:Z.propTo,defaultValue:{type:[Number,Array],default:0},marks:Object,disabled:{type:Boolean,default:void 0},formatTooltip:Function,keyboard:{type:Boolean,default:!0},min:{type:Number,default:0},max:{type:Number,default:100},step:{type:[Number,String],default:1},range:Boolean,value:[Number,Array],placement:String,showTooltip:{type:Boolean,default:void 0},tooltip:{type:Boolean,default:!0},vertical:Boolean,reverse:Boolean,"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array]}),So=Ze({name:"Slider",props:go,setup(a){const{mergedClsPrefixRef:l,namespaceRef:y,inlineThemeDisabled:v}=eo(a),s=ge("Slider","-slider",mo,vo,a,l),d=x(null),[z,R]=be(),[O,L]=be(),B=x(new Set),$=ro(a),{mergedDisabledRef:D}=$,ee=w(()=>{const{step:e}=a;if(Number(e)<=0||e==="mark")return 0;const o=e.toString();let t=0;return o.includes(".")&&(t=o.length-o.indexOf(".")-1),t}),K=x(a.defaultValue),pe=oo(a,"value"),X=lo(pe,K),b=w(()=>{const{value:e}=X;return(a.range?e:[e]).map(ie)}),oe=w(()=>b.value.length>2),we=w(()=>a.placement===void 0?a.vertical?"right":"top":a.placement),te=w(()=>{const{marks:e}=a;return e?Object.keys(e).map(parseFloat):null}),g=x(-1),ae=x(-1),C=x(-1),S=x(!1),I=x(!1),Y=w(()=>{const{vertical:e,reverse:o}=a;return e?o?"top":"bottom":o?"right":"left"}),xe=w(()=>{if(oe.value)return;const e=b.value,o=F(a.range?Math.min(...e):a.min),t=F(a.range?Math.max(...e):e[0]),{value:r}=Y;return a.vertical?{[r]:`${o}%`,height:`${t-o}%`}:{[r]:`${o}%`,width:`${t-o}%`}}),ke=w(()=>{const e=[],{marks:o}=a;if(o){const t=b.value.slice();t.sort((u,h)=>u-h);const{value:r}=Y,{value:i}=oe,{range:c}=a,p=i?()=>!1:u=>c?u>=t[0]&&u<=t[t.length-1]:u<=t[0];for(const u of Object.keys(o)){const h=Number(u);e.push({active:p(h),label:o[u],style:{[r]:`${F(h)}%`}})}}return e});function ye(e,o){const t=F(e),{value:r}=Y;return{[r]:`${t}%`,zIndex:o===g.value?1:0}}function ne(e){return a.showTooltip||C.value===e||g.value===e&&S.value}function Re(e){return S.value?!(g.value===e&&ae.value===e):!0}function Ce(e){var o;~e&&(g.value=e,(o=z.value.get(e))===null||o===void 0||o.focus())}function Se(){O.value.forEach((e,o)=>{ne(o)&&e.syncPosition()})}function re(e){const{"onUpdate:value":o,onUpdateValue:t}=a,{nTriggerFormInput:r,nTriggerFormChange:i}=$;t&&ve(t,e),o&&ve(o,e),K.value=e,r(),i()}function le(e){const{range:o}=a;if(o){if(Array.isArray(e)){const{value:t}=b;e.join()!==t.join()&&re(e)}}else Array.isArray(e)||b.value[0]!==e&&re(e)}function W(e,o){if(a.range){const t=b.value.slice();t.splice(o,1,e),le(t)}else le(e)}function J(e,o,t){const r=t!==void 0;t||(t=e-o>0?1:-1);const i=te.value||[],{step:c}=a;if(c==="mark"){const h=H(e,i.concat(o),r?t:void 0);return h?h.value:o}if(c<=0)return o;const{value:p}=ee;let u;if(r){const h=Number((o/c).toFixed(p)),k=Math.floor(h),q=h>k?k:k-1,G=h<k?k:k+1;u=H(o,[Number((q*c).toFixed(p)),Number((G*c).toFixed(p)),...i],t)}else{const h=Te(e);u=H(e,[...i,h])}return u?ie(u.value):o}function ie(e){return Math.min(a.max,Math.max(a.min,e))}function F(e){const{max:o,min:t}=a;return(e-t)/(o-t)*100}function ze(e){const{max:o,min:t}=a;return t+(o-t)*e}function Te(e){const{step:o,min:t}=a;if(Number(o)<=0||o==="mark")return e;const r=Math.round((e-t)/o)*o+t;return Number(r.toFixed(ee.value))}function H(e,o=te.value,t){if(!o?.length)return null;let r=null,i=-1;for(;++i<o.length;){const c=o[i]-e,p=Math.abs(c);(t===void 0||c*t>0)&&(r===null||p<r.distance)&&(r={index:i,distance:p,value:o[i]})}return r}function se(e){const o=d.value;if(!o)return;const t=me(e)?e.touches[0]:e,r=o.getBoundingClientRect();let i;return a.vertical?i=(r.bottom-t.clientY)/r.height:i=(t.clientX-r.left)/r.width,a.reverse&&(i=1-i),ze(i)}function Ve(e){if(D.value||!a.keyboard)return;const{vertical:o,reverse:t}=a;switch(e.key){case"ArrowUp":e.preventDefault(),A(o&&t?-1:1);break;case"ArrowRight":e.preventDefault(),A(!o&&t?-1:1);break;case"ArrowDown":e.preventDefault(),A(o&&t?1:-1);break;case"ArrowLeft":e.preventDefault(),A(!o&&t?1:-1);break}}function A(e){const o=g.value;if(o===-1)return;const{step:t}=a,r=b.value[o],i=Number(t)<=0||t==="mark"?r:r+t*e;W(J(i,r,e>0?1:-1),o)}function Me(e){var o,t;if(D.value||!me(e)&&e.button!==bo)return;const r=se(e);if(r===void 0)return;const i=b.value.slice(),c=a.range?(t=(o=H(r,i))===null||o===void 0?void 0:o.index)!==null&&t!==void 0?t:-1:0;c!==-1&&(e.preventDefault(),Ce(c),Be(),W(J(r,b.value[c]),c))}function Be(){S.value||(S.value=!0,j("touchend",document,N),j("mouseup",document,N),j("touchmove",document,P),j("mousemove",document,P))}function E(){S.value&&(S.value=!1,U("touchend",document,N),U("mouseup",document,N),U("touchmove",document,P),U("mousemove",document,P))}function P(e){const{value:o}=g;if(!S.value||o===-1){E();return}const t=se(e);W(J(t,b.value[o]),o)}function N(){E()}function $e(e){g.value=e,D.value||(C.value=e)}function De(e){g.value===e&&(g.value=-1,E()),C.value===e&&(C.value=-1)}function Ie(e){C.value=e}function Fe(e){C.value===e&&(C.value=-1)}ue(g,(e,o)=>void Q(()=>ae.value=o)),ue(X,()=>{if(a.marks){if(I.value)return;I.value=!0,Q(()=>{I.value=!1})}Q(Se)}),to(()=>{E()});const de=w(()=>{const{self:{markFontSize:e,railColor:o,railColorHover:t,fillColor:r,fillColorHover:i,handleColor:c,opacityDisabled:p,dotColor:u,dotColorModal:h,handleBoxShadow:k,handleBoxShadowHover:q,handleBoxShadowActive:G,handleBoxShadowFocus:He,dotBorder:Ae,dotBoxShadow:Ee,railHeight:Pe,railWidthVertical:Ne,handleSize:_e,dotHeight:je,dotWidth:Ue,dotBorderRadius:Oe,fontSize:Le,dotBorderActive:Ke,dotColorPopover:Xe},common:{cubicBezierEaseInOut:Ye}}=s.value;return{"--n-bezier":Ye,"--n-dot-border":Ae,"--n-dot-border-active":Ke,"--n-dot-border-radius":Oe,"--n-dot-box-shadow":Ee,"--n-dot-color":u,"--n-dot-color-modal":h,"--n-dot-color-popover":Xe,"--n-dot-height":je,"--n-dot-width":Ue,"--n-fill-color":r,"--n-fill-color-hover":i,"--n-font-size":Le,"--n-handle-box-shadow":k,"--n-handle-box-shadow-active":G,"--n-handle-box-shadow-focus":He,"--n-handle-box-shadow-hover":q,"--n-handle-color":c,"--n-handle-size":_e,"--n-opacity-disabled":p,"--n-rail-color":o,"--n-rail-color-hover":t,"--n-rail-height":Pe,"--n-rail-width-vertical":Ne,"--n-mark-font-size":e}}),T=v?he("slider",void 0,de,a):void 0,ce=w(()=>{const{self:{fontSize:e,indicatorColor:o,indicatorBoxShadow:t,indicatorTextColor:r,indicatorBorderRadius:i}}=s.value;return{"--n-font-size":e,"--n-indicator-border-radius":i,"--n-indicator-box-shadow":t,"--n-indicator-color":o,"--n-indicator-text-color":r}}),V=v?he("slider-indicator",void 0,ce,a):void 0;return{mergedClsPrefix:l,namespace:y,uncontrolledValue:K,mergedValue:X,mergedDisabled:D,mergedPlacement:we,isMounted:ao(),adjustedTo:Z(a),dotTransitionDisabled:I,markInfos:ke,isShowTooltip:ne,shouldKeepTooltipTransition:Re,handleRailRef:d,setHandleRefs:R,setFollowerRefs:L,fillStyle:xe,getHandleStyle:ye,activeIndex:g,arrifiedValues:b,followerEnabledIndexSet:B,handleRailMouseDown:Me,handleHandleFocus:$e,handleHandleBlur:De,handleHandleMouseEnter:Ie,handleHandleMouseLeave:Fe,handleRailKeyDown:Ve,indicatorCssVars:v?void 0:ce,indicatorThemeClass:V?.themeClass,indicatorOnRender:V?.onRender,cssVars:v?void 0:de,themeClass:T?.themeClass,onRender:T?.onRender}},render(){var a;const{mergedClsPrefix:l,themeClass:y,formatTooltip:v}=this;return(a=this.onRender)===null||a===void 0||a.call(this),f("div",{class:[`${l}-slider`,y,{[`${l}-slider--disabled`]:this.mergedDisabled,[`${l}-slider--active`]:this.activeIndex!==-1,[`${l}-slider--with-mark`]:this.marks,[`${l}-slider--vertical`]:this.vertical,[`${l}-slider--reverse`]:this.reverse}],style:this.cssVars,onKeydown:this.handleRailKeyDown,onMousedown:this.handleRailMouseDown,onTouchstart:this.handleRailMouseDown},f("div",{class:`${l}-slider-rail`},f("div",{class:`${l}-slider-rail__fill`,style:this.fillStyle}),this.marks?f("div",{class:[`${l}-slider-dots`,this.dotTransitionDisabled&&`${l}-slider-dots--transition-disabled`]},this.markInfos.map(s=>f("div",{key:s.label,class:[`${l}-slider-dot`,{[`${l}-slider-dot--active`]:s.active}],style:s.style}))):null,f("div",{ref:"handleRailRef",class:`${l}-slider-handles`},this.arrifiedValues.map((s,d)=>{const z=this.isShowTooltip(d);return f(so,null,{default:()=>[f(co,null,{default:()=>f("div",{ref:this.setHandleRefs(d),class:`${l}-slider-handle-wrapper`,tabindex:this.mergedDisabled?-1:0,style:this.getHandleStyle(s,d),onFocus:()=>{this.handleHandleFocus(d)},onBlur:()=>{this.handleHandleBlur(d)},onMouseenter:()=>{this.handleHandleMouseEnter(d)},onMouseleave:()=>{this.handleHandleMouseLeave(d)}},io(this.$slots.thumb,()=>[f("div",{class:`${l}-slider-handle`})]))}),this.tooltip&&f(uo,{ref:this.setFollowerRefs(d),show:z,to:this.adjustedTo,enabled:this.showTooltip&&!this.range||this.followerEnabledIndexSet.has(d),teleportDisabled:this.adjustedTo===Z.tdkey,placement:this.mergedPlacement,containerClass:this.namespace},{default:()=>f(no,{name:"fade-in-scale-up-transition",appear:this.isMounted,css:this.shouldKeepTooltipTransition(d),onEnter:()=>{this.followerEnabledIndexSet.add(d)},onAfterLeave:()=>{this.followerEnabledIndexSet.delete(d)}},{default:()=>{var R;return z?((R=this.indicatorOnRender)===null||R===void 0||R.call(this),f("div",{class:[`${l}-slider-handle-indicator`,this.indicatorThemeClass,`${l}-slider-handle-indicator--${this.mergedPlacement}`],style:this.indicatorCssVars},typeof v=="function"?v(s):s)):null}})})]})})),this.marks?f("div",{class:`${l}-slider-marks`},this.markInfos.map(s=>f("div",{key:s.label,class:`${l}-slider-mark`,style:s.style},s.label))):null))}});export{So as _};
