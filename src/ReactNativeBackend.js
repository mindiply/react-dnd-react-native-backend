/**
 * Created by bongio on 09/03/2017.
 */
import {PanResponder} from 'react-native'

export class ReactNativeBackend {
    constructor (manager, options = {}) {
        options.delayTouchStart = options.delayTouchStart || options.delay

        options = {
            enableTouchEvents: true,
            enableMouseEvents: false,
            enableKeyboardEvents: false,
            delayTouchStart: 0,
            delayMouseStart: 0,
            ...options
        }

        this.actions = manager.getActions();
        this.monitor = manager.getMonitor();
        this.registry = manager.getRegistry();

        this.enableKeyboardEvents = options.enableKeyboardEvents;
        this.delayTouchStart = options.delayTouchStart;
        this.delayMouseStart = options.delayMouseStart;
        this.sourceNodes = {};
        this.sourceNodeOptions = {};
        this.sourcePreviewNodes = {};
        this.sourcePreviewNodeOptions = {};
        this.targetNodeOptions = {};
        this.listenerTypes = [];
        this._mouseClientOffset = {};

        if (options.enableMouseEvents) {
            this.listenerTypes.push('mouse');
        }

        if (options.enableTouchEvents) {
            this.listenerTypes.push('touch');
        }

        if (options.enableKeyboardEvents) {
            this.listenerTypes.push('keyboard')
        }

        this.getSourceClientOffset = this.getSourceClientOffset.bind(this);
        this.handleTopMoveStart = this.handleTopMoveStart.bind(this);
        this.handleTopMoveStartDelay = this.handleTopMoveStartDelay.bind(this);
        this.handleTopMoveStartCapture = this.handleTopMoveStartCapture.bind(this);
        this.handleTopMoveCapture = this.handleTopMoveCapture.bind(this);
        this.handleTopMove = this.handleTopMove.bind(this);
        this.handleTopMoveEndCapture = this.handleTopMoveEndCapture.bind(this);
        this.handleCancelOnEscape = this.handleCancelOnEscape.bind(this);
    }

    setup () {
        this._panResponder = PanResponder.create({
            // Ask to be the responder:
            onStartShouldSetPanResponder: (evt, gestureState) => true,
            onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
            onMoveShouldSetPanResponder: (evt, gestureState) => true,
            onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,

            onPanResponderGrant: (evt, gestureState) => {
                // The guesture has started. Show visual feedback so the user knows
                // what is happening!

                // gestureState.d{x,y} will be set to zero now
            },
            onPanResponderMove: (evt, gestureState) => {
                // The most recent move distance is gestureState.move{X,Y}

                // The accumulated gesture distance since becoming responder is
                // gestureState.d{x,y}
            },
            onPanResponderTerminationRequest: (evt, gestureState) => true,
            onPanResponderRelease: (evt, gestureState) => {
                // The user has released all touches while this view is the
                // responder. This typically means a gesture has succeeded
            },
            onPanResponderTerminate: (evt, gestureState) => {
                // Another component has become the responder, so this gesture
                // should be cancelled
            },
            onShouldBlockNativeResponder: (evt, gestureState) => {
                // Returns whether this component should block native components from becoming the JS
                // responder. Returns true by default. Is currently only supported on android.
                return true
            },
        })

        this.addEventListener(window, 'start',      this.getTopMoveStartHandler());
        this.addEventListener(window, 'start',      this.handleTopMoveStartCapture, true);
        this.addEventListener(window, 'move',       this.handleTopMove);
        this.addEventListener(window, 'move',       this.handleTopMoveCapture, true);
        this.addEventListener(window, 'end',        this.handleTopMoveEndCapture, true);

        if (this.enableKeyboardEvents){
            this.addEventListener(window, 'keydown', this.handleCancelOnEscape, true);
        }
    }

    teardown () {
        if (typeof window === 'undefined') {
            return;
        }

        this.constructor.isSetUp = false;
        this._mouseClientOffset = {};

        this.removeEventListener(window, 'start', this.handleTopMoveStartCapture, true);
        this.removeEventListener(window, 'start', this.handleTopMoveStart);
        this.removeEventListener(window, 'move',  this.handleTopMoveCapture, true);
        this.removeEventListener(window, 'move',  this.handleTopMove);
        this.removeEventListener(window, 'end',   this.handleTopMoveEndCapture, true);

        if (this.enableKeyboardEvents){
            this.removeEventListener(window, 'keydown', this.handleCancelOnEscape, true);
        }

        this.uninstallSourceNodeRemovalObserver();
    }

    addEventListener (subject, event, handler, capture) {
        const options = supportsPassive ? {capture, passive: false} : capture;

        this.listenerTypes.forEach(function (listenerType) {
            subject.addEventListener(eventNames[listenerType][event], handler, options);
        });
    }

    removeEventListener (subject, event, handler, capture) {
        const options = supportsPassive ? {capture, passive: false} : capture;

        this.listenerTypes.forEach(function (listenerType) {
            subject.removeEventListener(eventNames[listenerType][event], handler, options);
        });
    }

    connectDragSource (sourceId, node, options) {
        const handleMoveStart = this.handleMoveStart.bind(this, sourceId);
        this.sourceNodes[sourceId] = node;

        this.addEventListener(node, 'start', handleMoveStart);

        return () => {
            delete this.sourceNodes[sourceId];
            this.removeEventListener(node, 'start', handleMoveStart);
        };
    }

    connectDragPreview (sourceId, node, options) {
        this.sourcePreviewNodeOptions[sourceId] = options;
        this.sourcePreviewNodes[sourceId] = node;

        return () => {
            delete this.sourcePreviewNodes[sourceId];
            delete this.sourcePreviewNodeOptions[sourceId];
        };
    }

    connectDropTarget (targetId, node) {
        const handleMove = (e) => {
            let coords;

            /**
             * Grab the coordinates for the current mouse/touch position
             */
            switch (e.type) {
                case eventNames.mouse.move:
                    coords = { x: e.clientX, y: e.clientY };
                    break;

                case eventNames.touch.move:
                    coords = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                    break;
            }

            /**
             * Use the coordinates to grab the element the drag ended on.
             * If the element is the same as the target node (or any of it's children) then we have hit a drop target and can handle the move.
             */
            let droppedOn = document.elementFromPoint(coords.x, coords.y);
            let childMatch = node.contains(droppedOn);

            if (droppedOn === node || childMatch) {
                return this.handleMove(e, targetId);
            }
        };

        /**
         * Attaching the event listener to the body so that touchmove will work while dragging over multiple target elements.
         */
        this.addEventListener(document.querySelector('body'), 'move', handleMove);


        return () => {
            this.removeEventListener(document.querySelector('body'), 'move', handleMove);
        };
    }

    getSourceClientOffset (sourceId) {
        return getNodeClientOffset(this.sourceNodes[sourceId]);
    }

    handleTopMoveStartCapture (e) {
        this.moveStartSourceIds = [];
    }

    handleMoveStart (sourceId) {
        this.moveStartSourceIds.unshift(sourceId);
    }

    getTopMoveStartHandler () {
        if (!this.delayTouchStart && !this.delayMouseStart) {
            return this.handleTopMoveStart;
        }

        return this.handleTopMoveStartDelay;
    }

    handleTopMoveStart (e) {
        // Don't prematurely preventDefault() here since it might:
        // 1. Mess up scrolling
        // 2. Mess up long tap (which brings up context menu)
        // 3. If there's an anchor link as a child, tap won't be triggered on link

        const clientOffset = getEventClientOffset(e);
        if (clientOffset) {
            this._mouseClientOffset = clientOffset;
        }
    }

    handleTopMoveStartDelay (e) {
        const delay = (e.type === eventNames.touch.start)
            ? this.delayTouchStart
            : this.delayMouseStart;
        this.timeout = setTimeout(this.handleTopMoveStart.bind(this, e), delay);
    }

    handleTopMoveCapture (e) {
        this.dragOverTargetIds = [];
    }

    handleMove( e, targetId ) {
        this.dragOverTargetIds.unshift( targetId );
    }

    handleTopMove (e) {
        clearTimeout(this.timeout);

        const { moveStartSourceIds, dragOverTargetIds } = this;
        const clientOffset = getEventClientOffset(e);

        if (!clientOffset) {
            return;
        }


        // If we're not dragging and we've moved a little, that counts as a drag start
        if (
            !this.monitor.isDragging() &&
            this._mouseClientOffset.hasOwnProperty('x') &&
            moveStartSourceIds &&
            (
                this._mouseClientOffset.x !== clientOffset.x ||
                this._mouseClientOffset.y !== clientOffset.y
            )
        ) {
            this.moveStartSourceIds = null;
            this.actions.beginDrag(moveStartSourceIds, {
                clientOffset: this._mouseClientOffset,
                getSourceClientOffset: this.getSourceClientOffset,
                publishSource: false
            });
        }

        if (!this.monitor.isDragging()) {
            return;
        }

        const sourceNode = this.sourceNodes[this.monitor.getSourceId()];
        this.installSourceNodeRemovalObserver(sourceNode);
        this.actions.publishDragSource();

        e.preventDefault();

        /*
         const matchingTargetIds = Object.keys(this.targetNodes)
         .filter((targetId) => {
         const boundingRect = this.targetNodes[targetId].getBoundingClientRect();
         return clientOffset.x >= boundingRect.left &&
         clientOffset.x <= boundingRect.right &&
         clientOffset.y >= boundingRect.top &&
         clientOffset.y <= boundingRect.bottom;
         });
         */

        this.actions.hover(dragOverTargetIds, {
            clientOffset: clientOffset
        });
    }

    handleTopMoveEndCapture (e) {
        if (!this.monitor.isDragging() || this.monitor.didDrop()) {
            this.moveStartSourceIds = null;
            return;
        }

        e.preventDefault();

        this._mouseClientOffset = {};

        this.uninstallSourceNodeRemovalObserver();
        this.actions.drop();
        this.actions.endDrag();
    }

    handleCancelOnEscape (e) {
        if (e.key === "Escape"){
            this._mouseClientOffset = {};

            this.uninstallSourceNodeRemovalObserver();
            this.actions.endDrag();
        }
    }

    installSourceNodeRemovalObserver (node) {
        this.uninstallSourceNodeRemovalObserver();

        this.draggedSourceNode = node;
        this.draggedSourceNodeRemovalObserver = new window.MutationObserver(() => {
                if (!node.parentElement) {
            this.resurrectSourceNode();
            this.uninstallSourceNodeRemovalObserver();
        }
    });

        if (!node || !node.parentElement) {
            return;
        }

        this.draggedSourceNodeRemovalObserver.observe(
            node.parentElement,
            { childList: true }
        );
    }

    resurrectSourceNode () {
        this.draggedSourceNode.style.display = 'none';
        this.draggedSourceNode.removeAttribute('data-reactid');
        document.body.appendChild(this.draggedSourceNode);
    }

    uninstallSourceNodeRemovalObserver () {
        if (this.draggedSourceNodeRemovalObserver) {
            this.draggedSourceNodeRemovalObserver.disconnect();
        }

        this.draggedSourceNodeRemovalObserver = null;
        this.draggedSourceNode = null;
    }
}

export default function createReactNativeBackend (optionsOrManager = {}) {
    const reactNativeBackendFactory = function (manager) {
        return new ReactNativeBackend(manager, optionsOrManager)
    }

    if (optionsOrManager.getMonitor) {
        return reactNativeBackendFactory(optionsOrManager)
    } else {
        return reactNativeBackendFactory
    }
}
