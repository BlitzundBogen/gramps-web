import {html, css, LitElement} from 'lit'

import '@material/mwc-icon'
import '@material/mwc-button'
import '@material/mwc-icon-button'

import {sharedStyles} from '../SharedStyles.js'
import {fireEvent} from '../util.js'

function _applyTag (str, tag) {
  const [name, value] = tag
  if (name === 'bold') {
    return html`<b>${str}</b>`
  }
  if (name === 'italic') {
    return html`<i>${str}</i>`
  }
  if (name === 'underline') {
    return html`<u>${str}</u>`
  }
  if (name === 'fontface') {
    return html`<span style="font-family:${value}">${str}</span>`
  }
  if (name === 'fontsize') {
    return html`<span style="font-size:${value}px;">${str}</span>`
  }
  if (name === 'fontcolor') {
    return html`<span style="color:${value}">${str}</span>`
  }
  if (name === 'highlight') {
    return html`<span style="background-color:${value}">${str}</span>`
  }
  if (name === 'superscript') {
    return html`<sup>${str}</sup>`
  }
  if (name === 'link') {
    return html`<a href="${value}">${str}</a>`
  }
  return html`[${name} ${value}]${str}[/${name}]`
}

// check if tag name is a boolean tag
function isBooleanTag (tagName) {
  const namesBool = ['bold', 'italic', 'underline', 'superscript']
  if (namesBool.includes(tagName)) {
    return true
  }
  return false
}

function _applyTags (str, tags) {
  let tstr = html`${str}`
  tags.forEach((tag) => {
    tstr = _applyTag(tstr, tag)
  })
  return tstr
}

// get the number of text characters before a node in a parent
function getNumCharBeforeNode (node, parent) {
  let n = 0
  let found = false
  parent.childNodes.forEach(childNode => {
    if (childNode === node) {
      found = true
    }
    if (!found) {
      if (childNode.hasChildNodes()) {
        const [nChild, foundChild] = getNumCharBeforeNode(node, childNode)
        n += nChild
        found = foundChild
      } else if (childNode.nodeType !== Node.COMMENT_NODE) {
        n += childNode.textContent.length
      }
    }
  })
  return [n, found]
}

// get the node at the number of characters in a parent
function getNodeAtNumChar (parent, num) {
  let n = 0
  let found = false
  let node = null
  parent.childNodes.forEach(childNode => {
    if (!found) {
      if (childNode.nodeType !== Node.COMMENT_NODE) {
        n += childNode.textContent.length
        if (n >= num) {
          found = true
          node = childNode
        }
      }
    }
  })
  if (node !== null && node.hasChildNodes()) {
    return getNodeAtNumChar(node, num - (n - node.textContent.length))
  }
  return node
}

class GrampsjsEditor extends LitElement {
  static get styles () {
    return [
      sharedStyles,
      css`
      .note {
        font-family: var(--grampsjs-note-font-family, Roboto Slab);
        font-size: var(--grampsjs-note-font-size, 20px);
        line-height: var(--grampsjs-note-line-height, 1.5em);
        color: var(--grampsjs-note-color, #000000);
        white-space: pre-wrap;
      }

      .framed {
        border: 1px solid var(--mdc-theme-secondary);
        border-radius: 8px;
        padding: 20px 25px;
      }

      mwc-icon-button {
        color: rgba(0, 0, 0, 0.5);
      }

      #controls {
        margin: 0.7em 0;
      }
      `
    ]
  }

  static get properties () {
    return {
      data: {type: Object},
      cursorPosition: {type: Array}
    }
  }

  constructor () {
    super()
    this.data = {_class: 'StyledText', string: '', tags: []}
    this.cursorPosition = [0]
  }

  reset () {
    this.data = {_class: 'StyledText', string: '', tags: []}
    this.cursorPosition = [0]
  }

  render () {
    return html`
    <div id="controls">
      <mwc-icon-button icon="format_bold" @click="${() => this._handleFormat('bold')}"></mwc-icon-button>
      <mwc-icon-button icon="format_italic" @click="${() => this._handleFormat('italic')}"></mwc-icon-button>
      <mwc-icon-button icon="format_underlined" @click="${() => this._handleFormat('underline')}"></mwc-icon-button>
    </div>
    <div
      class="note framed"
      contenteditable="true"
      @beforeinput="${this._handleBeforeInput}"
    >${this._getHtml()}</div>
    `
  }

  // handle input actions by modifying the data object
  // (and cancelling the browser default behaviour)
  _handleBeforeInput (e) {
    e.preventDefault()
    e.stopPropagation()
    if (['insertText', 'insertParagraph', 'insertLineBreak', 'deleteContentBackward', 'deleteContentForward', 'insertFromPaste'].includes(e.inputType)) {
      const div = this.shadowRoot.querySelector('div.note')
      const [range] = e.getTargetRanges()
      const nCharBefore1 = getNumCharBeforeNode(range.startContainer, div)[0]
      if (e.inputType === 'insertText') {
        this._insertText(e.data, nCharBefore1 + range.startOffset)
        this.cursorPosition = [nCharBefore1 + range.startOffset + e.data.length]
      }
      if (e.inputType === 'insertFromPaste') {
        const data = e.dataTransfer.getData('text/plain')
        this._insertText(data, nCharBefore1 + range.startOffset)
        this.cursorPosition = [nCharBefore1 + range.startOffset + data.length]
      } else if (e.inputType === 'insertParagraph') {
        this._insertText('\n\n', nCharBefore1 + range.startOffset)
        this.cursorPosition = [nCharBefore1 + range.startOffset + 2]
      } else if (e.inputType === 'insertLineBreak') {
        this._insertText('\n', nCharBefore1 + range.startOffset)
        this.cursorPosition = [nCharBefore1 + range.startOffset + 1]
      } else if (['deleteContentBackward', 'deleteContentForward'].includes(e.inputType)) {
        const nCharBefore2 = getNumCharBeforeNode(range.endContainer, div)[0]
        this._deleteText(nCharBefore1 + range.startOffset, nCharBefore2 + range.endOffset)
        this.cursorPosition = [nCharBefore1 + range.startOffset]
      }
    } else {
      console.log(e)
    }
    this.handleChange()
  }

  _handleFormat (type) {
    const div = this.shadowRoot.querySelector('div.note')
    const range = document.getSelection().getRangeAt(0)
    const nCharBefore1 = getNumCharBeforeNode(range.startContainer, div)[0]
    const nCharBefore2 = getNumCharBeforeNode(range.endContainer, div)[0]
    const pos = [nCharBefore1 + range.startOffset, nCharBefore2 + range.endOffset]
    if (isBooleanTag(type) && this._hasTag(type, pos)) {
      // if it's a boolean tag and already selected in the whole range, remove it
      this._removeTag(type, pos)
    } else {
      this._insertTag(type, pos)
    }
    this.cursorPosition = pos
    this.handleChange()
  }

  handleChange () {
    fireEvent(this, 'formdata:changed', {data: this.data})
  }

  _insertTag (tagname, range) {
    this.data = {
      ...this.data,
      tags: this._cleanTags([...this.data.tags, {name: tagname, ranges: [range], value: null}])
    }
  }

  _hasTag (tagname, range) {
    const [tag] = this._cleanTags(this.data.tags).filter(tag => tag.name === tagname)
    if (tag === undefined) {
      return false
    }
    const ranges = (tag.ranges || []).sort((r1, r2) => r1[0] - r2[0])
    let charCovered = 0
    for (let i = 0; i < ranges.length; i++) {
      if (ranges[i][1] <= range[0]) {
        // not there yet
        continue
      }
      // number of overlapping characters
      charCovered += Math.max(0, Math.min(ranges[i][1], range[1]) - Math.max(ranges[i][0], range[0]))
      if (ranges[i][0] >= range[1]) {
        // already passed
        break
      }
    }
    // true if all characters overlapped
    if (charCovered === range[1] - range[0]) {
      return true
    }
    return false
  }

  _removeTag (tagname, range) {
    if (range[1] <= range[0]) {
      return
    }
    this.data = {
      ...this.data,
      tags: this._cleanTags(
        [
          // tags of different type: don't touch
          ...this.data.tags.filter(tag => tag.name !== tagname),
          // tags of our type: change ranges
          ...this.data.tags.filter(tag => tag.name === tagname)
            .map(tag => ({
              ...tag,
              ranges: tag.ranges.reduce((rangesNew, tagRange, i) => {
                // no overlap
                if ((tagRange[0] >= range[1]) || (tagRange[1] <= range[0])) {
                  // just append
                  return [...rangesNew, tagRange]
                }
                // inside
                if ((tagRange[0] >= range[0]) && (tagRange[1] <= range[1])) {
                  // don't append
                  return rangesNew
                }
                // contains
                if ((tagRange[0] < range[0]) && (tagRange[1] > range[1])) {
                  // appent two parts
                  return [...rangesNew, [tagRange[0], range[0]], [range[1], tagRange[1]]]
                }
                // overlaps right
                if (tagRange[0] >= range[0]) {
                  // cut at range[1]
                  return [...rangesNew, [range[1], tagRange[1]]]
                }
                // overlaps left
                if (tagRange[1] <= range[1]) {
                  // cut at range[0]
                  return [...rangesNew, [tagRange[0], range[0]]]
                }
                return rangesNew
              },
              [])
            })
            )
        ]
      )
    }
  }

  // sort, combine, and clean up tags
  _cleanTags (tags) {
    // get unique tag names
    let tagsClean = []
    // names corresponding to boolean tags
    const names = [...new Set(tags.map(tag => tag.name))]
    names.forEach(tagname => {
      const nameTags = tags.filter(tag => tag.name === tagname)
      if (isBooleanTag(tagname)) {
        tagsClean = [...tagsClean, ...this._cleanTagsBool(nameTags)]
      } else {
        tagsClean = [...tagsClean, ...this._cleanTagsNonBool(nameTags)]
      }
    })
    return tagsClean
  }

  _cleanTagsBool (tags) {
    if (tags.length === 0) {
      return []
    }
    const name = tags[0].name
    const ranges = (
      tags
        // combine all ranges
        .reduce((arr, tag, i) => {
          return [...arr, ...tag.ranges]
        }, [])
        // sort by start index
        .sort((r1, r2) => r1[0] - r2[0])
        // drop vanishing ranges
        .filter(r => r[1] > r[0])
        .reduce((rangesNew, range) => {
          const L = rangesNew.length
          if (L > 0 && range[0] <= rangesNew[L - 1][1]) {
            // if range has overlap with previous, merge them
            const rangeMerged = [rangesNew[L - 1][0], Math.max(range[1], rangesNew[L - 1][1])]
            return [...rangesNew.slice(0, -1), rangeMerged]
          } else {
            // default: just append
            return [...rangesNew, range]
          }
        }, [])
    )
    return [{name: name, ranges: ranges, value: null}]
  }

  // FIXME
  _cleanTagsNonBool (tags) {
    return tags
  }

  // insert string at position
  _insertText (str, position) {
    this.data = {
      ...this.data,
      // string is old data with str inserted in between
      string: (
        this.data.string.slice(0, position) +
        str +
        this.data.string.slice(position)
      ),
      // for tags, need to shift by str.length all values after position
      tags: this.data.tags.map(tag => ({
        ...tag,
        ranges: tag.ranges.map(range => range.map(x => x < position ? x : x + str.length))
      })
      )
    }
  }

  // remove string between positions
  _deleteText (posStart, posEnd) {
    const d = posEnd - posStart
    if (d <= 0) {
      return
    }
    this.data = {
      ...this.data,
      // string is old data with str inserted in between
      string: (
        this.data.string.slice(0, posStart) +
        this.data.string.slice(posEnd)
      ),
      // for tags, need to shift by str.length all values after position
      tags: this.data.tags.map(tag => ({
        ...tag,
        ranges: tag.ranges.map(range => range.map(x => x < posStart ? x : x > posEnd ? x - d : posStart))
      })
      )
    }
  }

  updated (changed) {
    // set selection
    const div = this.shadowRoot.querySelector('div.note')
    const nodeStart = getNodeAtNumChar(div, this.cursorPosition[0])
    if (nodeStart !== null) {
      const offsetStart = getNumCharBeforeNode(nodeStart, div)[0]
      // no selection but only cursor
      if (this.cursorPosition.length === 1) {
        this._setCursor(nodeStart, this.cursorPosition[0] - offsetStart)
      } else {
        // set selection range
        const nodeEnd = getNodeAtNumChar(div, this.cursorPosition[1])
        if (nodeEnd !== null) {
          const offsetEnd = getNumCharBeforeNode(nodeEnd, div)[0]
          this._setSelection(
            nodeStart,
            this.cursorPosition[0] - offsetStart,
            nodeEnd,
            this.cursorPosition[1] - offsetEnd
          )
        }
      }
    }
  }

  _setCursor (node, offset) {
    document.getSelection().collapse(node, offset)
  }

  _setSelection (nodeStart, offsetStart, nodeEnd, offsetEnd) {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      selection.removeAllRanges()
    }
    const range = document.createRange()
    range.setStart(nodeStart, offsetStart)
    range.setEnd(nodeEnd, offsetEnd)
    selection.addRange(range)
  }

  _getTagArray () {
    const tags = this.data.tags || []
    const tagsNew = []
    tags.forEach((tag) => {
      tag.ranges.forEach((range) => {
        tagsNew.push([range[0], 'start', tag.name, tag.value])
        tagsNew.push([range[1], 'end', tag.name, tag.value])
      })
    })
    tagsNew.sort((a, b) => a[0] - b[0])
    return tagsNew
  }

  _getHtml () {
    let str = html``
    const tags = this._getTagArray()
    let activeTags = []
    let i = 0
    tags.forEach(tag => {
      const [j, t, name, value] = tag
      str = html`${str}${j > i ? _applyTags(this.data.string.slice(i, j), activeTags) : ''}`
      if (t === 'start') {
        activeTags.push([name, value])
      } else {
        activeTags = activeTags.filter(_tag => _tag[0] !== name)
      }
      i = j
    })
    str = html`${str}${_applyTags(this.data.string.slice(i), activeTags)}`
    return str
  }

  _handleSaveButton () {
    fireEvent(this, 'edit:action', {action: 'updateProp', data: {text: this.data}})
    fireEvent(this, 'edit-mode:off')
  }

  connectedCallback () {
    super.connectedCallback()
    window.addEventListener('edit-mode:save', this._handleSaveButton.bind(this))
  }

  disconnectedCallback () {
    window.removeEventListener('edit-mode:save', this._handleSaveButton.bind(this))
    super.disconnectedCallback()
  }
}

window.customElements.define('grampsjs-editor', GrampsjsEditor)